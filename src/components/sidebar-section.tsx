"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useSidebarSection } from "@/hooks/use-sidebar-section";

interface SidebarSectionProps {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SidebarSection({
  id,
  title,
  count,
  action,
  defaultOpen = true,
  children,
}: SidebarSectionProps) {
  const { open, toggle } = useSidebarSection(id, defaultOpen);
  const contentId = `sidebar-section-${id}`;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-1 px-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ChevronDown
            aria-hidden
            className={`h-3 w-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              open ? "" : "-rotate-90"
            }`}
          />
          <span className="truncate">{title}</span>
          {typeof count === "number" && count > 0 && (
            <span className="ml-0.5 font-mono text-[10px] font-normal normal-case tracking-normal tabular-nums text-muted-foreground/50">
              {count}
            </span>
          )}
        </button>
        {action}
      </div>
      <div
        id={contentId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        // React 19 supports the native `inert` attribute, which removes the
        // subtree from the a11y tree and tab order when collapsed.
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
