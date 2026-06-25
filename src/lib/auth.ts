import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { logError } from "@/lib/logger";
import { prisma } from "./prisma";
import { decrypt } from "./encryption";
import {
  authJwtCallback,
  authSessionCallback,
  authSignInCallback,
  type DbUser,
  type JwtDbUser,
  type SessionWithUser,
} from "./auth-callbacks";

export type { DbUser, JwtDbUser, SessionWithUser };

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Twitter({
      clientId: process.env.AUTH_TWITTER_ID!,
      clientSecret: process.env.AUTH_TWITTER_SECRET!,
      // Must set `url`: passing only `params` replaces the default string URL and
      // normalizeEndpoint falls back to https://authjs.dev (broken OAuth).
      authorization: {
        url: "https://x.com/i/oauth2/authorize",
        params: {
          scope: "tweet.read users.read bookmark.read offline.access",
        },
      },
    }),
  ],
  callbacks: {
    signIn: authSignInCallback,
    jwt: authJwtCallback,
    session: authSessionCallback,
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Reduced from 30 days for better security posture (smaller blast radius if a cookie is compromised)
    maxAge: 14 * 24 * 60 * 60, // 14 days
  },

  // Explicit secure cookie flag (defense in depth)
  useSecureCookies:
    process.env.NODE_ENV === "production" ||
    !!(process.env.AUTH_URL || process.env.NEXTAUTH_URL)?.startsWith("https://"),

  /**
   * Comprehensive secure cookie configuration.
   *
   * All Auth.js cookies are now explicitly hardened for production use.
   * This is especially important for an app that may be open-sourced.
   */
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 14 * 24 * 60 * 60, // must match session.maxAge
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.callback-url"
        : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      // __Host- is the strictest prefix for CSRF tokens
      name: process.env.NODE_ENV === "production"
        ? "__Host-authjs.csrf-token"
        : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    pkceCodeVerifier: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.pkce.code_verifier"
        : "authjs.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 15 * 60, // 15 minutes (OAuth flow only)
      },
    },
    state: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.state"
        : "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 15 * 60,
      },
    },
    nonce: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.nonce"
        : "authjs.nonce",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 15 * 60,
      },
    },
    webauthnChallenge: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.challenge"
        : "authjs.challenge",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 15 * 60,
      },
    },
  },
});

/* ============================================================
   SECURE COOKIE HELPERS (Single Source of Truth)
   Re-exported from the Edge-safe module so imports from @/lib/auth continue to work.
   Middleware imports directly from @/lib/auth-edge to avoid pulling in Node-only
   modules (prisma, encryption.ts with "crypto", node:dns).
   ============================================================ */

export { getSessionCookieName, getUserIdFromRequest } from "./auth-edge";

/**
 * Returns the current authenticated user from the JWT (no DB hit in the happy path).
 *
 * After Phase 1, this is extremely cheap. For very old sessions it may still do one
 * fallback lookup (see jwt/session callbacks).
 */
export async function getDbUser(): Promise<DbUser | null> {
  try {
    const session = (await auth()) as SessionWithUser | null;
    return session?.dbUser ?? null;
  } catch (e) {
    logError("auth", "getDbUser failed", e);
    return null;
  }
}

export async function getUserTokens(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });
  if (!user) return null;
  try {
    return {
      accessToken: decrypt(user.accessToken),
      refreshToken: decrypt(user.refreshToken),
      tokenExpiresAt: user.tokenExpiresAt,
    };
  } catch (e) {
    logError("auth", "getUserTokens decrypt failed", e);
    return null;
  }
}
