"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useSidebarSection } from "@/hooks/use-sidebar-section";
import { useTypography } from "@/hooks/use-typography";

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
  const t = useTypography();
  const { open, toggle } = useSidebarSection(id, defaultOpen);
  const contentId = `sidebar-section-${id}`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-1 border-b border-hairline-soft px-1 pb-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-0.5 text-left font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            t.monoNative ? cn(t.label, t.chromeLabel) : "text-2xs uppercase tracking-[0.14em]"
          )}
        >
          <ChevronDown
            aria-hidden
            className={`h-3 w-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              open ? "" : "-rotate-90"
            }`}
          />
          <span className="truncate">{title}</span>
          {typeof count === "number" && count > 0 && (
            <span
              className={cn(
                t.data,
                "ml-0.5 text-2xs font-normal normal-case tracking-normal text-muted-foreground/50"
              )}
            >
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
