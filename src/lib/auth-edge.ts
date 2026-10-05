import { decode } from "@auth/core/jwt";
import { NextRequest } from "next/server";
import { jwtDecrypt } from "jose";
import hkdf from "@panva/hkdf";

/* ============================================================
   EDGE-SAFE SESSION HELPERS
   Used exclusively by middleware for per-user rate limiting.
   This module MUST NOT import any Node.js-only modules
   (no "crypto", no "node:dns", no prisma, no encryption.ts).
   ============================================================ */

const isProduction = process.env.NODE_ENV === "production";

export function getSessionCookieName(): string {
  return isProduction
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

/**
 * Securely extracts the user ID from the Auth.js v5 session cookie.
 *
 * Auth.js v5 stores the session as a JWE (encrypted), not a JWS.
 * We use jwtDecrypt + HKDF key derivation to match Auth.js internals.
 *
 * This is the only place middleware is allowed to read the session for
 * per-user rate limiting. It is completely Edge Runtime compatible.
 */
export async function getUserIdFromRequest(
  request: NextRequest
): Promise<string | null> {
  const cookieName = getSessionCookieName();
  const token = request.cookies.get(cookieName)?.value;

  if (!token || !process.env.AUTH_SECRET) {
    return null;
  }

  try {
    const salt = cookieName;
    const key = await hkdf(
      "sha256",
      process.env.AUTH_SECRET,
      salt,
      `Auth.js Generated Encryption Key (${salt})`,
      64
    );

    const { payload } = await jwtDecrypt(token, key, {
      clockTolerance: 15,
    });

    return (payload.sub as string) || (payload.id as string) || null;
  } catch {
    // Silently fail — caller should treat as unauthenticated for rate limiting
    return null;
  }
}

function sessionCookieChunks(
  request: NextRequest
): { name: string; value: string }[] {
  const cookieName = getSessionCookieName();
  return request.cookies.getAll().filter((cookie) => {
    return cookie.name === cookieName || cookie.name.startsWith(`${cookieName}.`);
  });
}

/**
 * Names of session cookies this process cannot decrypt.
 *
 * Auth.js catches this case, returns no session, and expires the cookie — but
 * `auth()` from a Server Component drops that Set-Cookie, so the browser keeps
 * sending the bad token and every page logs JWTSessionError. Callers should
 * remove these cookies before rendering.
 *
 * Uses Auth.js `decode` with this process's `AUTH_SECRET` and the session
 * cookie salt, so a cookie the server can still read is left alone. A missing
 * `AUTH_SECRET` returns nothing: a config gap must not wipe sessions that
 * would become valid once the secret is present.
 */
export async function undecryptableSessionCookieNames(
  request: NextRequest
): Promise<string[]> {
  const chunks = sessionCookieChunks(request);
  const secret = process.env.AUTH_SECRET;
  if (chunks.length === 0 || !secret) return [];

  const token = [...chunks]
    .sort((a, b) => {
      const aSuffix = parseInt(a.name.split(".").pop() || "0", 10);
      const bSuffix = parseInt(b.name.split(".").pop() || "0", 10);
      return aSuffix - bSuffix;
    })
    .map((chunk) => chunk.value)
    .join("");

  if (!token) return chunks.map((chunk) => chunk.name);

  try {
    const payload = await decode({
      token,
      secret,
      salt: getSessionCookieName(),
    });
    return payload ? [] : chunks.map((chunk) => chunk.name);
  } catch {
    return chunks.map((chunk) => chunk.name);
  }
}
