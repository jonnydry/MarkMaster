import type { DbUser } from "@/lib/auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    dbUser?: DbUser;
    user: DefaultSession["user"];
    expires: string;
  }
}
