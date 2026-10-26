import { decrypt, encrypt } from "./encryption";

/** Short-lived httpOnly cookie holding a not-yet-signed-in user's X app. */
export const X_APP_PENDING_COOKIE = "mm.x-app";

const PENDING_MAX_AGE_SECONDS = 15 * 60;

export function xAppPendingCookieOptions(maxAge = PENDING_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge,
  };
}

/**
 * Seal a client id and secret for the OAuth start that happens before a User
 * row exists. Same AES-256-GCM layout as tokens at rest. The cookie is sent
 * only to /api/auth (authorize + callback) and is not readable by page JS.
 */
export function sealXAppPending(clientId: string, clientSecret: string): string {
  return encrypt(JSON.stringify({ v: 1, clientId, clientSecret }));
}

export function openXAppPending(
  value: string | undefined | null
): { clientId: string; clientSecret: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decrypt(value)) as {
      v?: unknown;
      clientId?: unknown;
      clientSecret?: unknown;
    };
    if (parsed.v !== 1) return null;
    if (typeof parsed.clientId !== "string" || typeof parsed.clientSecret !== "string") {
      return null;
    }
    const clientId = parsed.clientId.trim();
    const clientSecret = parsed.clientSecret.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}
