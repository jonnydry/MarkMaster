"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { highlightIndicatorActiveClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

export function BookmarkCardSelectionToggle({
  selected,
  onToggle,
}: {
  selected?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={selected}
      aria-label="Select bookmark"
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2",
        selected
          ? highlightIndicatorActiveClass
          : "border-border bg-background text-transparent hover:border-primary/50"
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

export function BookmarkCardActionButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
  active,
  className,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  shortcut?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "rounded-sm border border-transparent",
        active
          ? highlightIndicatorActiveClass
          : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground",
        className
      )}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

export function BookmarkTagChip({
  name,
  color,
  extraCount,
  density = "inset",
  uppercase = true,
  onClick,
  className,
  title,
}: {
  name: string;
  color?: string;
  extraCount?: number;
  density?: "inset" | "strong";
  uppercase?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={title ?? name}
      className={cn(
        "relative inline-flex h-5 max-w-full items-center gap-1 px-1.5 text-2xs font-medium text-muted-foreground transition-colors after:absolute after:-inset-x-1 after:-inset-y-3 hover:border-primary/35 hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
        density === "strong" ? "surface-inset-strong" : "surface-inset",
        uppercase ? "uppercase tracking-[0.08em]" : "normal-case",
        className
      )}
    >
      {color ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="truncate">{name}</span>
      {extraCount ? (
        <span className="text-muted-foreground/65">+{extraCount}</span>
      ) : null}
    </button>
  );
}
