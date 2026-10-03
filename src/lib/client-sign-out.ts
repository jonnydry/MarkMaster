"use client";

import { signOut as nextAuthSignOut, type SignOutParams } from "next-auth/react";

import { clearOrbitGraphEtags } from "@/hooks/use-orbit-graph";

/** Sign out and drop this browser's orbit-graph ETags first. */
export function signOut(options?: SignOutParams) {
  clearOrbitGraphEtags();
  return nextAuthSignOut(options);
}
