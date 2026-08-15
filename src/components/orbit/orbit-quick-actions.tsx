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
    <OrbitalMenu className="py-1 text-[12.5px]" role="menu" aria-label="Row actions">
      <div className={cn(orbital.label, "px-3 py-1 text-2xs text-primary/50")}>
        More
      </div>

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
        <ExternalLink className="size-3.5 text-primary/70" />
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
        <Link2 className="size-3.5 text-primary/70" />
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
          "w-full text-primary/70 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-destructive/45"
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
  const skipLabel = suggestionDismissed
    ? "Restore suggestion"
    : hasSuggestion
      ? "Skip suggestion"
      : "Keep in Orbit";

  const actions: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    tone?: "accept";
  }> = [];

  // Inbox-zero affordances appear only while an un-actioned suggestion exists.
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
      icon: <SlidersHorizontal className="size-3.5 text-primary" />,
    });
  }

  actions.push({
    key: "keep",
    label: skipLabel,
    icon: suggestionDismissed ? (
      <RotateCcw className="size-3.5 text-primary" />
    ) : (
      <CircleSlash2 className="size-3.5 text-primary" />
    ),
  });

  if (!hasSuggestion || suggestionDismissed) {
    actions.push({
      key: "tag",
      label: "Add tag",
      icon: <Tag className="size-3.5 text-bronze" />,
    });
  }

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
            "flex h-9 w-9 items-center justify-center rounded-sm transition-all",
            "hover:bg-primary/10 active:bg-primary/15",
            action.tone === "accept" &&
              "text-emerald-600 hover:bg-emerald-500/15 active:bg-emerald-500/20 dark:text-emerald-300",
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
