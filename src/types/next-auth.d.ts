import type { DbUser, JwtDbUser } from "@/lib/auth";
import type { DefaultSession } from "next-auth";
import type { JWT as NextAuthJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    dbUser?: DbUser;
    user: DefaultSession["user"];
    expires: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends NextAuthJWT {
    dbUser?: JwtDbUser;
    xId?: string;
    username?: string;
  }
}
