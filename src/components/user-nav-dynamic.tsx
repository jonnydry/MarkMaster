"use client";

import dynamic from "next/dynamic";
import type { DbUser } from "@/lib/auth";

const UserNavLazy = dynamic(
  () => import("./user-nav").then((m) => ({ default: m.UserNav })),
  { ssr: false }
);

/** User menu: client-only mount avoids SSR/hydration mismatches from Radix + theme in the shell header. */
export function UserNavDynamic(props: { user: DbUser }) {
  return <UserNavLazy {...props} />;
}
