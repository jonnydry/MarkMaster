"use client";

import { Check, ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMetaMuted} from "@/lib/orbit-route-chrome";
import {
  highlightIdleClass,
  highlightSegmentActiveClass,
} from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";
import type { OrbitGraphScope } from "@/types";

const GRAPH_SCOPE_OPTIONS: Array<{
  scope: OrbitGraphScope;
  label: string;
  detail: string;
}> = [
  {
    scope: "library",
    label: "Full library",
    detail: "All bookmarks, tags, and collections."},
  {
    scope: "orbit",
    label: "Orbit queue",
    detail: "Loose bookmarks that still need a home."},
];

interface OrbitMapScopeMenuProps {
  graphScope: OrbitGraphScope;
  isLoading?: boolean;
  onScopeChange: (scope: OrbitGraphScope) => void;
  className?: string;
}

export function OrbitMapScopeMenu({
  graphScope,
  isLoading = false,
  onScopeChange,
  className}: OrbitMapScopeMenuProps) {
  const activeOption =
    GRAPH_SCOPE_OPTIONS.find((option) => option.scope === graphScope) ??
    GRAPH_SCOPE_OPTIONS[0];

  return (
    <Popover>
      <PopoverTrigger
        disabled={isLoading}
        aria-label={`Graph view: ${activeOption.label}`}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-sm border bg-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
          orbitHairlineBorder(),
          className
        )}
      >
        <span className="hidden sm:inline">View</span>
        <span className="min-w-0 truncate">
          {graphScope === "library" ? "Library" : "Queue"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <div
          className={cn(
            orbitLabelClass(),
            "px-2 pb-1 pt-1.5 text-2xs",
            orbitMetaMuted()
          )}
        >
          Graph view
        </div>
        {GRAPH_SCOPE_OPTIONS.map((option) => {
          const active = option.scope === graphScope;
          return (
            <button
              key={option.scope}
              type="button"
              aria-pressed={active}
              onClick={() => onScopeChange(option.scope)}
              disabled={isLoading}
              className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
                active
                  ? highlightSegmentActiveClass
                  : cn("text-foreground", highlightIdleClass)
              )}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {active ? <Check className="size-3.5" aria-hidden /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  {option.label}
                </span>
                <span
                  className={cn(
                    "block text-2xs leading-4",
                    orbitMetaMuted()
                  )}
                >
                  {option.detail}
                </span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
