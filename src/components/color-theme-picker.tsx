"use client";

import { highlightSurfaceActiveClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";

type ColorThemePickerProps = {
  value: ColorThemeId;
  onChange: (value: ColorThemeId) => void;
  className?: string;
};

export function ColorThemePicker({ value, onChange, className }: ColorThemePickerProps) {
  return (
    /* Container-queried grid: 2 → 3 → 4 columns, then a single row at wide
       widths so seven themes stay balanced without a lone orphan tile. */
    <div
      className={cn("@container w-full", className)}
      role="radiogroup"
      aria-label="Accent color"
    >
      <div className="grid grid-cols-2 gap-2 @[18rem]:grid-cols-3 @[37rem]:grid-cols-4 @[52rem]:grid-cols-7">
        {COLOR_THEMES.map((theme) => {
          const selected = value === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={theme.name}
              title={theme.description}
              onClick={() => onChange(theme.id)}
              className={cn(
                "group flex min-w-0 flex-col items-center gap-1.5 rounded-sm border px-2 py-2 transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
                selected
                  ? highlightSurfaceActiveClass
                  : "border-hairline-soft bg-surface-2/45 hover:border-primary/20 hover:bg-accent-soft/40"
              )}
            >
              <span
                className={cn(
                  "h-5 w-5 rounded-full border",
                  selected ? "border-primary/50 ring-2 ring-primary/30" : "border-hairline-soft"
                )}
                style={{ backgroundColor: theme.swatch }}
              />
              <span
                className={cn(
                  "text-2xs font-medium leading-none",
                  selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              >
                {theme.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
