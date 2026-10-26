import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { logError } from "@/lib/logger";
import { oauthClientForAuthConfig } from "./x-app-credentials";
import {
  authJwtCallback,
  authSessionCallback,
  authSignInCallback,
  type DbUser,
  type JwtDbUser,
  type SessionWithUser,
} from "./auth-callbacks";

export type { DbUser, JwtDbUser, SessionWithUser };

function isLoopbackAuthUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Twitter provider for one resolved client.
 *
 * clientId and clientSecret are set explicitly. Auth.js copies AUTH_TWITTER_*
 * onto the provider only when those fields are missing (`setEnvDefaults`),
 * and `parseProviders` then lets this object win. Passing the resolved pair
 * here is what stops a public account from authorizing or exchanging tokens
 * with the host app.
 */
export function twitterProvider(client: { clientId: string; clientSecret: string }) {
  return Twitter({
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    // Must set `url`: passing only `params` replaces the default string URL and
    // normalizeEndpoint falls back to https://authjs.dev (broken OAuth).
    authorization: {
      url: "https://x.com/i/oauth2/authorize",
      params: {
        scope: "tweet.read users.read bookmark.read offline.access",
      },
    },
  });
}

function createAuthConfig(client: { clientId: string; clientSecret: string }) {
  return {
  // Vercel provides a controlled host header. Other reverse-proxy/self-hosted
  // deployments must opt in after configuring their trusted proxy chain.
  trustHost:
    process.env.VERCEL === "1" ||
    process.env.AUTH_TRUST_HOST === "true" ||
    isLoopbackAuthUrl(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL),
  providers: [twitterProvider(client)],
  callbacks: {
    signIn: authSignInCallback,
    jwt: authJwtCallback,
    session: authSessionCallback,
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt" as const,
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
        sameSite: "lax" as const,
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
        sameSite: "lax" as const,
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
        sameSite: "lax" as const,
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
        sameSite: "lax" as const,
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
        sameSite: "lax" as const,
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
        sameSite: "lax" as const,
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
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 15 * 60,
      },
    },
  },
  };
}

/**
 * Per-request Auth.js config. `auth()` from a Server Component calls this
 * with no request and must not hit the database or attach the host X secret.
 * Authorize and callback requests resolve the signed-in user's stored app,
 * then the owner/bootstrap env rule. See oauthClientForAuthConfig.
 */
export async function authConfigForRequest(req: NextRequest | undefined) {
  const client = await oauthClientForAuthConfig(req);
  return createAuthConfig(client);
}

export const { handlers, signIn, signOut, auth } = NextAuth((req) =>
  authConfigForRequest(req)
);

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
