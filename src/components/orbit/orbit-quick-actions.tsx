"use client";

import {
  Check,
  CircleSlash2,
  ExternalLink,
  Link2,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
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
    <OrbitalMenu role="menu" aria-label="Row actions">
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => handleAction("open-x")}
        className={cn(
          orbital.menuItem,
          "w-full focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
        )}
      >
        <ExternalLink className="size-3.5 text-muted-foreground" />
        <span className="flex-1 text-left">Open on X</span>
      </button>

      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => handleAction("copy-link")}
        className={cn(
          orbital.menuItem,
          "w-full focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
        )}
      >
        <Link2 className="size-3.5 text-muted-foreground" />
        <span className="flex-1 text-left">Copy link</span>
      </button>

      <div role="separator" className="my-1 mx-2 h-px bg-hairline-soft" />

      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => handleAction("discard")}
        className={cn(
          orbital.menuItem,
          "w-full text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-destructive/45"
        )}
      >
        <X className="size-3.5" />
        <span className="flex-1 text-left">Discard</span>
      </button>
    </OrbitalMenu>
  );
}

export function OrbitActionPill({
  bookmarkId,
  onAction,
  suggestionDismissed = false,
  hasSuggestion = false,
}: Omit<OrbitQuickActionProps, "onClose"> & {
  suggestionDismissed?: boolean;
  /** When true, a Grok suggestion is queued — surface inbox-zero Accept/Edit. */
  hasSuggestion?: boolean;
}) {
  const actions: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    tone?: "accept";
  }> = [];

  // Triage controls only when there is a suggestion to act on (or restore).
  // Idle rows used to show a dead "Keep in Orbit" that marked them skipped.
  if (hasSuggestion && !suggestionDismissed) {
    actions.push({
      key: "accept",
      label: "Accept suggestion",
      icon: <Check className="size-3.5" />,
      tone: "accept",
    });
    actions.push({
      key: "edit",
      label: "Edit in review",
      icon: <SlidersHorizontal className="size-3.5" />,
    });
    actions.push({
      key: "keep",
      label: "Skip suggestion",
      icon: <CircleSlash2 className="size-3.5" />,
    });
  } else if (suggestionDismissed) {
    actions.push({
      key: "keep",
      label: "Restore suggestion",
      icon: <RotateCcw className="size-3.5" />,
    });
  }

  if (!hasSuggestion || suggestionDismissed) {
    actions.push({
      key: "tag",
      label: "Add tag",
      icon: <Tag className="size-3.5" />,
    });
  }

  if (actions.length === 0) return null;

  return (
    <OrbitalActionPill>
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
            "flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors",
            "hover:bg-hover hover:text-foreground",
            action.tone === "accept" &&
              "text-success hover:bg-success/10 hover:text-success",
            action.key === "keep" && suggestionDismissed && "bg-primary/10 text-primary"
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
