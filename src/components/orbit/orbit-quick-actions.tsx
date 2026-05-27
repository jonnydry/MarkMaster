"use client";

import { ExternalLink, Link2, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { orbital, OrbitalMenu, OrbitalActionPill } from "@/components/orbital";

interface OrbitQuickActionProps {
  bookmarkId: string;
  onAction?: (bookmarkId: string, action: string) => void;
  onClose?: () => void;
}

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
        More
      </div>

      <div onClick={() => handleAction("open-x")} className={orbital.menuItem}>
        <ExternalLink className="size-3.5 text-primary/70" />
        <span className="flex-1">Open on X</span>
      </div>

      <div onClick={() => handleAction("copy-link")} className={orbital.menuItem}>
        <Link2 className="size-3.5 text-primary/70" />
        <span className="flex-1">Copy link</span>
      </div>

      <div className="my-1 mx-2 h-px bg-hairline-soft" />

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

export function OrbitActionPill({
  bookmarkId,
  onAction,
  suggestionDismissed = false,
}: Omit<OrbitQuickActionProps, "onClose"> & {
  suggestionDismissed?: boolean;
}) {
  const skipLabel = suggestionDismissed
    ? "Restore Grok suggestion"
    : "Skip Grok suggestion";

  const actions = [
    {
      key: "keep",
      label: skipLabel,
      icon: (
        <div
          className={cn(
            "size-3 rounded-full",
            suggestionDismissed ? "bg-primary/40 ring-2 ring-primary/60" : "bg-primary"
          )}
        />
      ),
    },
    { key: "tag", label: "Add tag", icon: <Tag className="size-3 text-bronze" /> },
  ];

  return (
    <OrbitalActionPill className="orbital-action-pill">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          aria-pressed={action.key === "keep" ? suggestionDismissed : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(bookmarkId, action.key);
          }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-all",
            "hover:bg-primary/10 active:bg-primary/15",
            action.key === "keep" &&
              (suggestionDismissed
                ? "bg-primary/15 text-primary"
                : "text-primary hover:bg-primary/20")
          )}
          title={action.label}
          aria-label={action.label}
        >
          {action.icon}
        </button>
      ))}
    </OrbitalActionPill>
  );
}
