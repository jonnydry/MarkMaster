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

      if (!account.access_token || !account.refresh_token) {
        console.error("[auth] Missing access_token or refresh_token from provider");
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
      await prisma.user.upsert({
        where: { xId },
        update: {
          username,
          displayName,
          profileImageUrl,
          accessToken: encrypt(account.access_token),
          refreshToken: encrypt(account.refresh_token),
          tokenExpiresAt: account.expires_at
            ? new Date(account.expires_at * 1000)
            : null,
        },
        create: {
          xId,
          username,
          displayName,
          profileImageUrl,
          accessToken: encrypt(account.access_token),
          refreshToken: encrypt(account.refresh_token),
          tokenExpiresAt: account.expires_at
            ? new Date(account.expires_at * 1000)
            : null,
        },
      });
      } catch (e) {
        console.error("[auth] signIn prisma upsert failed:", e);
        return false;
      }

      return true;
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.xId = account.providerAccountId;
        const twitterProfile = profile as Record<string, unknown>;
        const data = twitterProfile?.data as
          | Record<string, string>
          | undefined;
        token.username = data?.username ?? (profile?.name || "");
      }
      return token;
    },
    async session({ session, token }) {
      if (token.xId) {
        const user = await prisma.user.findUnique({
          where: { xId: token.xId as string },
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
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
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

export interface SessionWithUser {
  user: { name?: string; email?: string; image?: string };
  expires: string;
  dbUser: DbUser;
}

export async function getDbUser(): Promise<DbUser | null> {
  const session = (await auth()) as SessionWithUser | null;
  return session?.dbUser ?? null;
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
