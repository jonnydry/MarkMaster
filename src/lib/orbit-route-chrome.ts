import { cn } from "@/lib/utils";

/** Sentence-case Orbit label (matches the shared SANS_LABEL contract). */
export function orbitLabelClass(extra?: string) {
  return cn("text-xs font-medium text-muted-foreground", extra);
}

export function orbitDataClass(extra?: string) {
  return cn("font-mono text-2xs tabular-nums", extra);
}

export function orbitHairlineBorder() {
  return "border-hairline-soft";
}

export function orbitBannerClass(extra?: string) {
  return cn(
    "rounded-sm border border-warning/30 bg-warning/10",
    extra
  );
}

export function orbitGhostButtonClass() {
  return "surface-inset-strong text-foreground hover:bg-hover";
}

export function orbitSelectionBarClass(extra?: string) {
  return cn("surface-glass", extra);
}

/** Clamp floating menu position within the viewport. */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth = 200,
  menuHeight = 160
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const pad = 8;
  const maxX = window.innerWidth - menuWidth - pad;
  const maxY = window.innerHeight - menuHeight - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}
