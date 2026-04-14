"use client";

import dynamic from "next/dynamic";
import type { SidebarProps } from "@/components/sidebar";

/** Inert placeholder matching expanded rail width so layout stays stable before the chunk loads. */
function SidebarSkeleton() {
  return (
    <aside
      className="flex h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border/70 bg-sidebar py-3 px-3 shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)] dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]"
      aria-hidden
    />
  );
}

const SidebarImpl = dynamic<SidebarProps>(
  () => import("@/components/sidebar").then((m) => m.Sidebar),
  {
    ssr: false,
    loading: SidebarSkeleton,
  }
);

/** Client-only: avoids SSR/client HTML skew for this tree during dev (e.g. Turbopack HMR) and localStorage-driven layout. */
export function Sidebar(props: SidebarProps) {
  return <SidebarImpl {...props} />;
}
