"use client";

import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/sidebar-provider";

/** Wraps authenticated app routes so sidebar context always encloses pages that render `Sidebar`. */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}
