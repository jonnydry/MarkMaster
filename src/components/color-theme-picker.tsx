"use client";

import { cn } from "@/lib/utils";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";

type ColorThemePickerProps = {
  value: ColorThemeId;
  onChange: (value: ColorThemeId) => void;
  className?: string;
};

export function ColorThemePicker({ value, onChange, className }: ColorThemePickerProps) {
  return (
    <div
      className={cn("flex flex-wrap justify-end gap-2", className)}
      role="radiogroup"
      aria-label="Accent color"
    >
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
              "group flex min-w-[5.5rem] flex-col items-center gap-1.5 rounded-sm border px-2 py-2 transition-colors",
              selected
                ? "border-primary/40 bg-primary/5"
                : "border-hairline-soft bg-surface-2/40 hover:border-primary/20 hover:bg-accent-soft/40"
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full border shadow-sm",
                selected ? "border-primary/50 ring-2 ring-primary/30" : "border-hairline-soft"
              )}
              style={{ backgroundColor: theme.swatch }}
            />
            <span
              className={cn(
                "text-[10px] font-medium leading-none",
                selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            >
              {theme.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
