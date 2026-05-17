import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./encryption";

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
    async signIn({ account, profile }) {
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

        const refreshToken =
          account.refresh_token
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
    },

    /**
     * We embed the stable DbUser data directly into the JWT token.
     * This eliminates the per-request Prisma lookup in getDbUser() / session callback.
     *
     * - On initial sign-in (account present): load the user once and attach it.
     * - On explicit session.update() from the client (trigger === 'update'): we can refresh lastSyncAt.
     */
    async jwt({ token, account, profile, trigger }) {
      // First-time sign-in: load full user record once and embed it
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
            },
          });

          if (user) {
            (token as unknown as { dbUser?: JwtDbUser }).dbUser = user;
          }
        } catch (e) {
          console.error("[auth] jwt initial load failed:", e);
        }

        // Also keep the lightweight fields for backwards compatibility
        token.xId = xId;
        const twitterProfile = profile as Record<string, unknown>;
        const data = twitterProfile?.data as Record<string, string> | undefined;
        token.username = data?.username ?? (profile?.name || "");
      }

      // Support client-driven refresh (e.g. after a successful sync)
      const tokenWithDbUser = token as unknown as { dbUser?: JwtDbUser };
      if (trigger === "update" && tokenWithDbUser.dbUser) {
        const current = tokenWithDbUser.dbUser;
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: current.id },
            select: { lastSyncAt: true },
          });
          if (fresh) {
            tokenWithDbUser.dbUser = {
              ...current,
              lastSyncAt: fresh.lastSyncAt,
            };
          }
        } catch (e) {
          console.error("[auth] jwt update trigger failed to refresh lastSyncAt:", e);
        }
      }

      return token;
    },

    /**
     * Surface the DbUser we stored in the JWT.
     * No more Prisma call on every request — this is the main performance win.
     */
    async session({ session, token }) {
      const tokenWithDbUser = token as unknown as { dbUser?: JwtDbUser };
      const dbUserFromToken = tokenWithDbUser.dbUser;

      if (dbUserFromToken) {
        (session as unknown as SessionWithUser).dbUser = dbUserFromToken;
      } else if (typeof token.xId === "string" && token.xId.length > 0) {
        // Fallback for very old JWTs that were issued before this change.
        // This path will go away once all users have re-logged in.
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
            },
          });
          if (user) {
            (session as unknown as SessionWithUser).dbUser = user;
          }
        } catch (e) {
          console.error("[auth] session fallback prisma lookup failed:", e);
        }
      }

      return session;
    },
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

export interface DbUser {
  id: string;
  xId: string;
  username: string;
  displayName: string;
  profileImageUrl: string | null;
  lastSyncAt: Date | null;
}

/**
 * Shape we store inside the JWT token (stable identity).
 * We intentionally keep lastSyncAt here so the UI can show it without DB hits.
 * After a successful sync, clients can call `useSession().update()` to refresh it.
 */
export type JwtDbUser = DbUser;

export interface SessionWithUser {
  user: { name?: string; email?: string; image?: string };
  expires: string;
  dbUser: DbUser;
}

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
    console.error("[auth] getDbUser failed:", e);
    return null;
  }
}

export async function getUserTokens(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });
  if (!user) return null;
  return {
    accessToken: decrypt(user.accessToken),
    refreshToken: decrypt(user.refreshToken),
    tokenExpiresAt: user.tokenExpiresAt,
  };
}
