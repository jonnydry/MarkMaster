"use client";

import { Compass, Orbit as OrbitIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrbitMapPreset } from "@/components/orbit/orbit-map-canvas";

export type OrbitMapModifier = "lasso" | "pulse" | "density";

interface OrbitMapToolbarProps {
  preset: OrbitMapPreset;
  onPresetChange: (preset: OrbitMapPreset) => void;
  modifiers: OrbitMapModifier[];
  onModifiersChange: (modifiers: OrbitMapModifier[]) => void;
  truncatedCount: number;
  totalBookmarks: number;
  nodeCap: number;
}

const PRESET_OPTIONS: Array<{
  value: OrbitMapPreset;
  label: string;
  icon: typeof OrbitIcon;
  description: string;
}> = [
  {
    value: "orbit",
    label: "Orbit map",
    icon: OrbitIcon,
    description: "Full constellation with Orbit index centered.",
  },
  {
    value: "recent",
    label: "Recent band",
    icon: Sparkles,
    description: "Zoom into the freshly saved outer orbit.",
  },
  {
    value: "category",
    label: "Category web",
    icon: Compass,
    description: "Pull the camera back to see every cluster at once.",
  },
];

const MODIFIER_OPTIONS: Array<{ value: OrbitMapModifier; label: string }> = [
  { value: "lasso", label: "lasso" },
  { value: "pulse", label: "pulse" },
  { value: "density", label: "density" },
];

export function OrbitMapToolbar({
  preset,
  onPresetChange,
  modifiers,
  onModifiersChange,
  truncatedCount,
  totalBookmarks,
  nodeCap,
}: OrbitMapToolbarProps) {
  const toggleModifier = (modifier: OrbitMapModifier) => {
    const exists = modifiers.includes(modifier);
    onModifiersChange(
      exists ? modifiers.filter((m) => m !== modifier) : [...modifiers, modifier]
    );
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div
        role="tablist"
        aria-label="Orbit map preset"
        className="inline-flex w-full flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 shadow-sm backdrop-blur-sm sm:w-auto"
      >
        {PRESET_OPTIONS.map((option) => {
          const active = preset === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              title={option.description}
              onClick={() => onPresetChange(option.value)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <option.icon className="size-4" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Orbit map overlays"
          className="inline-flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 shadow-sm backdrop-blur-sm"
        >
          {MODIFIER_OPTIONS.map((option) => {
            const active = modifiers.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleModifier(option.value)}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                  active
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-white/65 hover:text-white"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {truncatedCount > 0 && (
          <span
            className="hidden items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100/90 sm:inline-flex"
            title={`Showing ${nodeCap.toLocaleString()} of ${totalBookmarks.toLocaleString()} bookmarks. Zoom into a cluster to explore more.`}
          >
            Showing {nodeCap.toLocaleString()} of {totalBookmarks.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
