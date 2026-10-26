import type { NextRequest } from "next/server";

import { readSessionDbUserId } from "./auth-edge";
import { decrypt, encrypt } from "./encryption";
import { logError } from "./logger";
import { prisma } from "./prisma";
import { openXAppPending, X_APP_PENDING_COOKIE } from "./x-app-pending";
import {
  isPublicHostedRuntime,
  UNCONFIGURED_X_OAUTH_CLIENT,
  X_APP_CREDENTIALS_REQUIRED,
  X_APP_CREDENTIALS_REQUIRED_MESSAGE,
  X_APP_SETTINGS_PATH,
} from "./x-app-shared";

export {
  isPublicHostedRuntime,
  UNCONFIGURED_X_OAUTH_CLIENT,
  X_APP_CREDENTIALS_REQUIRED,
  X_APP_CREDENTIALS_REQUIRED_MESSAGE,
  X_APP_SETTINGS_PATH,
};

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._~-]{8,200}$/;
const CLIENT_SECRET_PATTERN = /^[^\s\u0000-\u001f\u007f]{8,512}$/;

export type XAppCredentialSource = "user" | "owner" | "bootstrap" | "pending";

export type ResolvedXAppCredentials = {
  clientId: string;
  clientSecret: string;
  source: XAppCredentialSource;
};

export type XAppCredentialStatus = {
  configured: boolean;
  /** Ciphertext is present but cannot be used. Clear it and save again. */
  unreadable: boolean;
  clientIdLast4: string | null;
  secretLast4: string | null;
  /**
   * This account may call X with AUTH_TWITTER_* until it saves its own pair.
   * False for a public user on the hosted app — those calls must fail closed.
   */
  hostAppFallback: boolean;
};

type StoredXAppRow = {
  xClientId: string | null;
  xClientSecret: string | null;
};

/**
 * Thrown when a public account has no stored X app. Callers show Settings.
 * Do not catch this and continue with AUTH_TWITTER_*.
 */
export class XAppCredentialsRequiredError extends Error {
  readonly code = X_APP_CREDENTIALS_REQUIRED;
  readonly settingsPath = X_APP_SETTINGS_PATH;

  constructor() {
    super(X_APP_CREDENTIALS_REQUIRED_MESSAGE);
    this.name = "XAppCredentialsRequiredError";
  }
}

/**
 * Host env AUTH_TWITTER_ID / AUTH_TWITTER_SECRET rule:
 *
 * 1. A stored per-user pair always wins. It is loaded with
 *    `where: { id: userId }` only — never another user's row.
 * 2. If that user has no pair, the host env pair may be used only when:
 *    - `userId` equals OWNER_USER_ID (the operator account), or
 *    - this process is not the public hosted app.
 * 3. The public hosted app is `VERCEL=1` (preview and production). Local dev,
 *    tests, and a self-hosted single-tenant install are bootstrap: the env
 *    pair IS that install's X app. On Vercel the env pair belongs to the
 *    owner and must not be sent for anyone else.
 * 4. Otherwise fail closed with {@link XAppCredentialsRequiredError}. Do not
 *    call X with the host client secret.
 */
export function ownerUserId(): string | null {
  const owner = process.env.OWNER_USER_ID?.trim();
  return owner ? owner : null;
}

export function allowsHostXAppFallback(userId: string | null): boolean {
  const owner = ownerUserId();
  if (userId && owner && userId === owner) return true;
  return !isPublicHostedRuntime();
}

export function hostXAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.AUTH_TWITTER_ID?.trim() ?? "";
  if (!clientId) return null;
  return {
    clientId,
    clientSecret: process.env.AUTH_TWITTER_SECRET?.trim() ?? "",
  };
}

export function parseXAppCredentialInput(input: {
  clientId: unknown;
  clientSecret: unknown;
}):
  | { ok: true; clientId: string; clientSecret: string }
  | { ok: false; error: string } {
  if (typeof input.clientId !== "string" || typeof input.clientSecret !== "string") {
    return { ok: false, error: "Client ID and client secret are required." };
  }
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!CLIENT_ID_PATTERN.test(clientId) || !CLIENT_SECRET_PATTERN.test(clientSecret)) {
    return {
      ok: false,
      error:
        "Enter the client ID and client secret from your X Developer app. They cannot contain spaces.",
    };
  }
  return { ok: true, clientId, clientSecret };
}

/** Last 4 characters, or a full mask when the value is too short to split. */
export function xAppCredentialLast4(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "••••";
  return trimmed.slice(-4);
}

type StoredPairResult =
  | { state: "missing" }
  | { state: "unreadable" }
  | { state: "ok"; clientId: string; clientSecret: string };

function readStoredPair(row: StoredXAppRow): StoredPairResult {
  if (!row.xClientId && !row.xClientSecret) return { state: "missing" };
  if (!row.xClientId || !row.xClientSecret) return { state: "unreadable" };
  try {
    const clientId = decrypt(row.xClientId).trim();
    const clientSecret = decrypt(row.xClientSecret).trim();
    if (!clientId || !clientSecret) return { state: "unreadable" };
    return { state: "ok", clientId, clientSecret };
  } catch (error) {
    logError("x-app", "stored X app credentials could not be decrypted", error);
    return { state: "unreadable" };
  }
}

function fallbackCredentials(userId: string): ResolvedXAppCredentials {
  if (!allowsHostXAppFallback(userId)) {
    throw new XAppCredentialsRequiredError();
  }
  const host = hostXAppCredentials();
  if (!host) {
    throw new Error("AUTH_TWITTER_ID is not configured");
  }
  const owner = ownerUserId();
  return {
    ...host,
    source: owner && userId === owner ? "owner" : "bootstrap",
  };
}

/**
 * Resolve the X app for a row already loaded for `userId`.
 * Does not query. Callers must have used `where: { id: userId }`.
 */
export function resolveXAppCredentialsFromRow(
  userId: string,
  row: StoredXAppRow
): ResolvedXAppCredentials {
  const stored = readStoredPair(row);
  if (stored.state === "ok") {
    return {
      clientId: stored.clientId,
      clientSecret: stored.clientSecret,
      source: "user",
    };
  }
  // A partial or undecryptable pair is not "unset". Falling back to the host
  // app would send this user's refresh token to a different OAuth client.
  if (stored.state === "unreadable") {
    throw new XAppCredentialsRequiredError();
  }
  return fallbackCredentials(userId);
}

/**
 * Load and resolve this user's X app. The query is keyed only by `userId`.
 */
export async function resolveXAppCredentials(
  userId: string
): Promise<ResolvedXAppCredentials> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xClientId: true, xClientSecret: true },
  });
  if (!user) throw new Error("User not found");
  return resolveXAppCredentialsFromRow(userId, user);
}

export function xAppStatusFromRow(
  userId: string,
  row: StoredXAppRow
): XAppCredentialStatus {
  const stored = readStoredPair(row);
  if (stored.state === "ok") {
    return {
      configured: true,
      unreadable: false,
      clientIdLast4: xAppCredentialLast4(stored.clientId),
      secretLast4: xAppCredentialLast4(stored.clientSecret),
      hostAppFallback: false,
    };
  }
  return {
    configured: false,
    unreadable: stored.state === "unreadable",
    clientIdLast4: null,
    secretLast4: null,
    hostAppFallback: allowsHostXAppFallback(userId),
  };
}

export async function xAppCredentialStatus(
  userId: string
): Promise<XAppCredentialStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xClientId: true, xClientSecret: true },
  });
  if (!user) throw new Error("User not found");
  return xAppStatusFromRow(userId, user);
}

export function encryptXAppCredentials(clientId: string, clientSecret: string) {
  return {
    xClientId: encrypt(clientId),
    xClientSecret: encrypt(clientSecret),
  };
}

export type TwitterOAuthClientResult =
  | { ok: true; credentials: ResolvedXAppCredentials }
  | { ok: false; reason: "settings" | "configuration" };

/**
 * Client id + secret for an Auth.js authorize or callback request.
 *
 * Signed-in user with a stored pair: that pair.
 * Signed-in user with ciphertext that cannot be read: fail closed. Do not
 * substitute the host app.
 * Signed-in owner, or any user on a bootstrap install, with no pair: AUTH_TWITTER_*.
 * Signed-in public user on the hosted app with no pair: fail closed.
 * Signed-out: a pending cookie from the login form, else bootstrap env.
 * The pending cookie is never consulted while a session user id is present,
 * so it cannot override another account's stored app.
 */
export async function resolveTwitterOAuthClient(
  req: NextRequest
): Promise<TwitterOAuthClientResult> {
  const userId = await readSessionDbUserId(req);
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { xClientId: true, xClientSecret: true },
    });
    if (user) {
      const stored = readStoredPair(user);
      if (stored.state === "ok") {
        return {
          ok: true,
          credentials: {
            clientId: stored.clientId,
            clientSecret: stored.clientSecret,
            source: "user",
          },
        };
      }
      if (stored.state === "unreadable") {
        return { ok: false, reason: "settings" };
      }
    }
    if (!allowsHostXAppFallback(userId)) {
      return { ok: false, reason: "settings" };
    }
    const host = hostXAppCredentials();
    if (!host) return { ok: false, reason: "configuration" };
    const owner = ownerUserId();
    return {
      ok: true,
      credentials: {
        ...host,
        source: owner && userId === owner ? "owner" : "bootstrap",
      },
    };
  }

  const pending = openXAppPending(req.cookies.get(X_APP_PENDING_COOKIE)?.value);
  if (pending) {
    return { ok: true, credentials: { ...pending, source: "pending" } };
  }

  if (!allowsHostXAppFallback(null)) {
    return { ok: false, reason: "settings" };
  }
  const host = hostXAppCredentials();
  if (!host) return { ok: false, reason: "configuration" };
  return { ok: true, credentials: { ...host, source: "bootstrap" } };
}

export function isTwitterOAuthAction(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return path.endsWith("/signin/twitter") || path.endsWith("/callback/twitter");
}

/**
 * Client passed into the Twitter provider for this auth request.
 * Session, CSRF, and sign-out requests get {@link UNCONFIGURED_X_OAUTH_CLIENT}
 * so the host secret is not attached to those calls. Authorize and callback
 * get the resolved pair, or the same placeholder when the account must fail
 * closed — never AUTH_TWITTER_* for that account.
 */
export async function oauthClientForAuthConfig(
  req: NextRequest | undefined
): Promise<{ clientId: string; clientSecret: string }> {
  if (!req || !isTwitterOAuthAction(req.nextUrl.pathname)) {
    return UNCONFIGURED_X_OAUTH_CLIENT;
  }
  const resolved = await resolveTwitterOAuthClient(req);
  if (!resolved.ok) return UNCONFIGURED_X_OAUTH_CLIENT;
  return {
    clientId: resolved.credentials.clientId,
    clientSecret: resolved.credentials.clientSecret,
  };
}
