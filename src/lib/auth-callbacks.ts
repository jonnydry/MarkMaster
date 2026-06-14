import type { Account, Profile, Session, User } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
import { prisma } from "./prisma";
import { encrypt } from "./encryption";

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

type JwtWithDbUser = JWT & { dbUser?: JwtDbUser };

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
    console.error("[auth] Missing access_token from provider");
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

    if (!refreshToken) {
      console.error("[auth] Missing refresh_token for new sign-in");
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
        },
      });
    }
  } catch (e) {
    console.error("[auth] signIn prisma upsert failed:", e);
    return false;
  }

  return true;
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
}): Promise<JWT> {
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
        },
      });

      if (user) {
        tokenWithDbUser.dbUser = user;
      }
    } catch (e) {
      console.error("[auth] jwt initial load failed:", e);
    }

    tokenWithDbUser.xId = xId;
    const twitterProfile = profile as Record<string, unknown> | undefined;
    const data = twitterProfile?.data as Record<string, string> | undefined;
    tokenWithDbUser.username = data?.username ?? (profile?.name || "");
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
      console.error(
        "[auth] jwt update trigger failed to refresh lastSyncAt:",
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
      console.error("[auth] session fallback prisma lookup failed:", e);
    }
  }

  return sessionWithUser;
}
