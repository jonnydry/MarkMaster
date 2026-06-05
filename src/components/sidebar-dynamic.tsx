"use client";

import { Sidebar as SidebarImpl, type SidebarProps } from "@/components/sidebar";

/** Compatibility wrapper for app surfaces that import the sidebar through this module. */
export function Sidebar(props: SidebarProps) {
  return <SidebarImpl {...props} />;
}
