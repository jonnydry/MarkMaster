"use client";

import { PanelTopClose, PanelTopOpen } from "lucide-react";

import { usePageHeaderCompact } from "@/hooks/use-page-header-compact";
import { appToolbarSurfaceClassName } from "@/lib/app-chrome";
import { cn } from "@/lib/utils";

type PageHeaderCompactToggleProps = {
  className?: string;
};

export function PageHeaderCompactToggle({ className }: PageHeaderCompactToggleProps) {
  const { compact, toggleCompact } = usePageHeaderCompact();

  return (
    <button
      type="button"
      onClick={toggleCompact}
      aria-pressed={compact}
      aria-label={compact ? "Use expanded header" : "Use compact header"}
      title={compact ? "Expanded header" : "Compact header"}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-sm border text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        appToolbarSurfaceClassName,
        className
      )}
    >
      {compact ? (
        <PanelTopOpen className="size-3.5" aria-hidden />
      ) : (
        <PanelTopClose className="size-3.5" aria-hidden />
      )}
    </button>
  );
}
