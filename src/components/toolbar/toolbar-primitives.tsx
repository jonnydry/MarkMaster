"use client";

import type { ReactNode, RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { orbitHairlineBorder } from "@/lib/orbit-route-chrome";
import {
  highlightActiveClass,
  highlightIdleClass,
  highlightInteractiveClass,
  highlightSegmentActiveClass,
} from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

interface ToolbarSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  size?: "sm" | "md";
  className?: string;
  maxWidthClassName?: string;
  useSearchBar?: boolean;
}

export function ToolbarSearchField({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel,
  inputRef,
  size = "sm",
  className,
  maxWidthClassName,
  useSearchBar = false,
}: ToolbarSearchFieldProps) {
  const heightClass = size === "md" ? "h-10" : "h-9";

  if (useSearchBar) {
    return (
      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden rounded-sm border border-hairline-strong bg-background/35",
          maxWidthClassName,
          className
        )}
      >
        <SearchBar
          ref={inputRef}
          glass
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          inputClassName={heightClass}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative min-w-0 flex-1",
        maxWidthClassName,
        className
      )}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "w-full rounded-sm border border-hairline-strong bg-background/35 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          heightClass
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export interface ToolbarSegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

interface ToolbarSegmentControlProps<T extends string> {
  value: T;
  options: readonly ToolbarSegmentOption<T>[];
  onChange: (value: T) => void;
  "aria-label": string;
  variant?: "library" | "orbit";
  size?: "sm" | "md";
  className?: string;
}

export function ToolbarSegmentControl<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  variant = "library",
  size = "sm",
  className,
}: ToolbarSegmentControlProps<T>) {
  const buttonHeight = size === "md" ? "h-8" : "h-7";
  const buttonPadding = size === "md" ? "px-2.5" : "px-2";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 rounded-sm border p-0.5",
        variant === "library"
          ? "border-hairline-soft bg-background/35"
          : cn(orbitHairlineBorder(), "bg-background/35"),
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm text-xs font-semibold transition-colors disabled:opacity-50",
            buttonHeight,
            buttonPadding,
            value === option.value
              ? highlightSegmentActiveClass
              : variant === "library"
                ? highlightIdleClass
                : "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
          )}
        >
          {option.label}
          {option.badge}
        </button>
      ))}
    </div>
  );
}

interface ToolbarIconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  pressed?: boolean;
  onClick: () => void;
  "aria-controls"?: string;
  showIndicator?: boolean;
  className?: string;
}

export function ToolbarIconButton({
  icon: Icon,
  label,
  active,
  pressed,
  onClick,
  "aria-controls": ariaControls,
  showIndicator,
  className,
}: ToolbarIconButtonProps) {
  const isActive = active ?? pressed;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-expanded={pressed}
      aria-label={label}
      aria-controls={ariaControls}
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-sm border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        isActive
          ? highlightActiveClass
          : cn(
              "border-hairline-strong bg-background/35 text-muted-foreground",
              highlightInteractiveClass,
              "hover:text-foreground"
            ),
        className
      )}
    >
      <Icon className="size-4" aria-hidden />
      {showIndicator ? (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" aria-hidden />
      ) : null}
    </button>
  );
}

// Re-export highlight tokens for toolbar consumers.
export {
  highlightActiveClass,
  highlightIdleClass,
  highlightInteractiveClass,
  highlightSegmentActiveClass,
} from "@/lib/highlight-chrome";
