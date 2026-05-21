"use client";

import { ClipboardList, ExternalLink, Link2, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { orbital, OrbitalMenu, OrbitalActionPill } from "@/components/orbital";

/**
 * Orbit Quick Actions — Contextual Overlays
 *
 * Implements the two lightweight overlay patterns from Paper artboard HX-0:
 * 1. OrbitContextualMenu — compact vertical floating menu (for kebab / right-click / keyboard)
 * 2. OrbitActionPill — ultra-light 4-icon action cluster (appears on hover or active selection)
 *
 * These are deliberately minimal and fast. They complement the heavier slide-in panel.
 * All actions are currently wired as callbacks for later implementation.
 */

interface OrbitQuickActionProps {
  bookmarkId: string;
  onAction?: (bookmarkId: string, action: string) => void;
  onClose?: () => void;
}

// ------------------------------------------------------------------
// 1. Compact Contextual Menu (matches HX-0 Example 1 exactly)
// ------------------------------------------------------------------
export function OrbitContextualMenu({
  bookmarkId,
  onAction,
  onClose,
}: OrbitQuickActionProps) {
  const handleAction = (action: string) => {
    onAction?.(bookmarkId, action);
    onClose?.();
  };

  return (
    <OrbitalMenu className="orbital-menu py-1 text-[12.5px]">
      <div className={cn(orbital.label, "px-3 py-1 text-[10px] text-primary/50")}>
        MORE
      </div>

      <div
        onClick={() => handleAction("open-x")}
        className={orbital.menuItem}
      >
        <ExternalLink className="size-3.5 text-primary/70" />
        <span className="flex-1">Open on X</span>
      </div>

      <div
        onClick={() => handleAction("copy-link")}
        className={orbital.menuItem}
      >
        <Link2 className="size-3.5 text-primary/70" />
        <span className="flex-1">Copy link</span>
      </div>

      <div className="my-1 h-px bg-hairline-soft mx-2" />

      {/* Discard */}
      <div
        onClick={() => handleAction("discard")}
        className={cn(orbital.menuItem, "text-primary/70")}
      >
        <X className="size-3.5" />
        <span className="flex-1">Discard</span>
      </div>
    </OrbitalMenu>
  );
}

// ------------------------------------------------------------------
// 2. Light Floating Action Pill (matches HX-0 Example 2)
// ------------------------------------------------------------------
export function OrbitActionPill({
  bookmarkId,
  onAction,
}: Omit<OrbitQuickActionProps, "onClose">) {
  const actions = [
    { key: "keep", label: "Keep", icon: <div className="size-3 rounded-full bg-primary" /> },
    { key: "tag", label: "Tag", icon: <Tag className="size-3 text-bronze" /> },
    { key: "review", label: "Review", icon: <ClipboardList className="size-3 text-primary/70" /> },
  ];

  return (
    <OrbitalActionPill className="orbital-action-pill">
      {actions.map((action) => (
        <button
          key={action.key}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(bookmarkId, action.key);
          }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-all",
            "hover:bg-primary/10 active:bg-primary/15",
            action.key === "keep" && "text-primary hover:bg-primary/20"
          )}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}
    </OrbitalActionPill>
  );
}
