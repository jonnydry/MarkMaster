import type { Account, Profile, Session, User } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
import { cookies } from "next/headers";
import { readSessionDbUserIdFromCookieHeader } from "./auth-edge";
import { logError } from "./logger";
import { prisma } from "./prisma";
import { encrypt } from "./encryption";
import {
  openXAppPending,
  X_APP_PENDING_COOKIE,
  xAppPendingCookieOptions,
} from "./x-app-pending";

export interface DbUser {
  id: string;
  xId: string;
  username: string;
  displayName: string;
  profileImageUrl: string | null;
  lastSyncAt: Date | null;
  syncXFolders: boolean;
}

export type JwtDbUser = DbUser;

export interface SessionWithUser extends Session {
  dbUser?: DbUser;
}

type JwtWithDbUser = JWT & {
  dbUser?: JwtDbUser;
  /** User.sessionVersion at last validation; a DB mismatch revokes the session. */
  sessionVersion?: number;
  /** Epoch ms of the last sessionVersion check against the database. */
  sessionValidatedAt?: number;
};

/**
 * How long a JWT may go without re-checking User.sessionVersion. The token is
 * the source of truth between checks (no DB hit in the happy path), so this
 * is the maximum time a revoked session stays usable.
 */
export const SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Anonymous sign-in can carry a pending X app cookie (hosted login form).
 * A session user id means this browser is already signed in, so OAuth used
 * that account's stored pair or the owner/bootstrap env — do not let the
 * cookie overwrite another account. Returns null when the cookie is absent
 * or unreadable.
 */
async function xAppCredentialsFromPendingSignIn(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  try {
    const jar = await cookies();
    const header = jar
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    if (await readSessionDbUserIdFromCookieHeader(header)) return null;
    return openXAppPending(jar.get(X_APP_PENDING_COOKIE)?.value);
  } catch (error) {
    logError("auth", "pending X app cookie could not be read", error);
    return null;
  }
}

async function clearPendingXAppCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(X_APP_PENDING_COOKIE, "", xAppPendingCookieOptions(0));
  } catch (error) {
    logError("auth", "pending X app cookie could not be cleared", error);
  }
}

export async function authSignInCallback({
  account,
  profile,
}: {
  user: User | AdapterUser;
  account?: Account | null;
  profile?: Profile;
}): Promise<boolean> {
  if (!account || !profile) return false;

  if (!account.access_token) {
    logError("auth", "Missing access_token from provider");
    return false;
  }

  const xId = account.providerAccountId;
  const twitterProfile = profile as Record<string, unknown>;
  const data = twitterProfile.data as
    | Record<string, string | undefined>
    | undefined;
  const username =
    data?.username ??
    (twitterProfile.username as string | undefined) ??
    (profile as { name?: string }).name ??
    "";
  const displayName =
    data?.name ?? (profile as { name?: string }).name ?? username;
  const profileImageUrl =
    (data?.profile_image_url as string | undefined) ??
    (profile as { image?: string | null }).image ??
    null;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { xId },
      select: { id: true, refreshToken: true },
    });

    const refreshToken = account.refresh_token
      ? encrypt(account.refresh_token)
      : existingUser?.refreshToken;

    // Persist the app that just issued these tokens. Only the anonymous
    // pending-cookie path reaches here with a value; signed-in reconnect
    // already stored the pair from Settings.
    const pendingApp = await xAppCredentialsFromPendingSignIn();
    const pendingFields = pendingApp
      ? {
          xClientId: encrypt(pendingApp.clientId),
          xClientSecret: encrypt(pendingApp.clientSecret),
        }
      : {};

    if (!refreshToken) {
      logError("auth", "Missing refresh_token for new sign-in");
      return false;
    }

    const tokenExpiresAt = account.expires_at
      ? new Date(account.expires_at * 1000)
      : null;

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username,
          displayName,
          profileImageUrl,
          accessToken: encrypt(account.access_token),
          refreshToken,
          tokenExpiresAt,
          tokenRefreshedAt: new Date(),
          ...pendingFields,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          xId,
          username,
          displayName,
          profileImageUrl,
          accessToken: encrypt(account.access_token),
          refreshToken,
          tokenExpiresAt,
          tokenRefreshedAt: new Date(),
          ...pendingFields,
        },
      });
    }
    if (pendingApp) await clearPendingXAppCookie();
  } catch (e) {
    logError("auth", "signIn prisma upsert failed", e);
    return false;
  }

  return true;
}

/**
 * Compare the token's sessionVersion against the database at most once per
 * SESSION_REVALIDATE_INTERVAL_MS. Returns false when the session has been
 * revoked (version bumped or user deleted). Database errors fail open —
 * a DB blip must not log everyone out — and leave sessionValidatedAt
 * untouched so the next request retries.
 */
async function revalidateSessionVersion(
  token: JwtWithDbUser
): Promise<boolean> {
  const userId = token.dbUser?.id;
  // Legacy tokens minted before dbUser embedding carry only xId; they are at
  // most maxAge old and get replaced at next sign-in. Skip rather than guess.
  if (!userId) return true;

  const validatedAt = token.sessionValidatedAt;
  if (
    typeof validatedAt === "number" &&
    typeof token.sessionVersion === "number" &&
    Date.now() - validatedAt < SESSION_REVALIDATE_INTERVAL_MS
  ) {
    return true;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });

    if (!user) return false;

    // Tokens minted before sessionVersion existed adopt the current version.
    if (
      typeof token.sessionVersion === "number" &&
      user.sessionVersion !== token.sessionVersion
    ) {
      return false;
    }

    token.sessionVersion = user.sessionVersion;
    token.sessionValidatedAt = Date.now();
    return true;
  } catch (e) {
    logError("auth", "sessionVersion revalidation failed", e);
    return true;
  }
}

export async function authJwtCallback({
  token,
  account,
  profile,
  trigger,
}: {
  token: JWT;
  user?: User | AdapterUser;
  account?: Account | null;
  profile?: Profile;
  trigger?: "signIn" | "signUp" | "update";
}): Promise<JWT | null> {
  const tokenWithDbUser = token as JwtWithDbUser;

  if (account) {
    const xId = account.providerAccountId;

    try {
      const user = await prisma.user.findUnique({
        where: { xId },
        select: {
          id: true,
          xId: true,
          username: true,
          displayName: true,
          profileImageUrl: true,
          lastSyncAt: true,
          syncXFolders: true,
          sessionVersion: true,
        },
      });

      if (user) {
        const { sessionVersion, ...dbUser } = user;
        tokenWithDbUser.dbUser = dbUser;
        tokenWithDbUser.sessionVersion = sessionVersion;
        tokenWithDbUser.sessionValidatedAt = Date.now();
      }
    } catch (e) {
      logError("auth", "jwt initial load failed", e);
    }

    tokenWithDbUser.xId = xId;
    const twitterProfile = profile as Record<string, unknown> | undefined;
    const data = twitterProfile?.data as Record<string, string> | undefined;
    tokenWithDbUser.username = data?.username ?? (profile?.name || "");
  } else {
    const stillValid = await revalidateSessionVersion(tokenWithDbUser);
    if (!stillValid) return null;
  }

  if (trigger === "update" && tokenWithDbUser.dbUser) {
    const current = tokenWithDbUser.dbUser;
    try {
      const fresh = await prisma.user.findUnique({
        where: { id: current.id },
        select: { lastSyncAt: true, syncXFolders: true },
      });
      if (fresh) {
        tokenWithDbUser.dbUser = {
          ...current,
          lastSyncAt: fresh.lastSyncAt,
          syncXFolders: fresh.syncXFolders,
        };
      }
    } catch (e) {
      logError(
        "auth",
        "jwt update trigger failed to refresh lastSyncAt",
        e,
      );
    }
  }

  return tokenWithDbUser;
}

export async function authSessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
  user?: AdapterUser;
  newSession?: Session;
  trigger?: "update";
}): Promise<Session> {
  const tokenWithDbUser = token as JwtWithDbUser;
  const sessionWithUser = session as SessionWithUser;
  const dbUserFromToken = tokenWithDbUser.dbUser;

  if (dbUserFromToken) {
    sessionWithUser.dbUser = dbUserFromToken;
  } else if (typeof token.xId === "string" && token.xId.length > 0) {
    try {
      const user = await prisma.user.findUnique({
        where: { xId: token.xId },
        select: {
          id: true,
          xId: true,
          username: true,
          displayName: true,
          profileImageUrl: true,
          lastSyncAt: true,
          syncXFolders: true,
        },
      });
      if (user) {
        sessionWithUser.dbUser = user;
      }
    } catch (e) {
      logError("auth", "session fallback prisma lookup failed", e);
    }
  }

  return sessionWithUser;
}
