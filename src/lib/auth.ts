import NextAuth from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./encryption";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Twitter({
      clientId: process.env.AUTH_TWITTER_ID!,
      clientSecret: process.env.AUTH_TWITTER_SECRET!,
      authorization: {
        params: {
          scope:
            "tweet.read tweet.write users.read bookmark.read bookmark.write offline.access",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || !profile) return false;

      const xId = account.providerAccountId;
      const twitterProfile = profile as Record<string, unknown>;
      const data = twitterProfile.data as Record<string, string> | undefined;

      await prisma.user.upsert({
        where: { xId },
        update: {
          username: data?.username ?? (profile.name || ""),
          displayName: data?.name ?? (profile.name || ""),
          profileImageUrl:
            (data?.profile_image_url as string) ?? (profile.image as string),
          accessToken: encrypt(account.access_token || ""),
          refreshToken: encrypt(account.refresh_token || ""),
          tokenExpiresAt: account.expires_at
            ? new Date(account.expires_at * 1000)
            : null,
        },
        create: {
          xId,
          username: data?.username ?? (profile.name || ""),
          displayName: data?.name ?? (profile.name || ""),
          profileImageUrl:
            (data?.profile_image_url as string) ?? (profile.image as string),
          accessToken: encrypt(account.access_token || ""),
          refreshToken: encrypt(account.refresh_token || ""),
          tokenExpiresAt: account.expires_at
            ? new Date(account.expires_at * 1000)
            : null,
        },
      });

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
