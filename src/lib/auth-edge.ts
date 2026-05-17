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
  } catch (err) {
    // Silently fail — caller should treat as unauthenticated for rate limiting
    return null;
  }
}
