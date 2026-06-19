import { appPageShellClassName } from "@/lib/app-layout";
import { cn } from "@/lib/utils";

/** Classic void keeps softer corners; default Button uses rounded-sm. */
export function orbitControlRadius() {
  return "rounded-lg";
}

/** Shell wrapper for /orbit routes. Classic mode follows the app light/dark color mode. */
export function orbitShellClass() {
  return cn(appPageShellClassName, "orbit-route-default");
}

export function orbitLabelClass(extra?: string) {
  return cn(
    "text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground dark:text-white/55",
    extra
  );
}

export function orbitDataClass(extra?: string) {
  return cn("font-mono text-2xs tabular-nums", extra);
}

export function orbitSectionLabelClass(extra?: string) {
  return orbitLabelClass(extra);
}

export function orbitHairlineBorder() {
  return "border-hairline-soft dark:border-white/10";
}

export function orbitMetaMuted() {
  return "text-muted-foreground dark:text-white/55";
}

export function orbitMetaSoft() {
  return "text-muted-foreground dark:text-white/60";
}

export function orbitForeground() {
  return "text-foreground dark:text-white";
}

export function orbitPanelClass(extra?: string) {
  return cn(
    "rounded-lg border border-hairline-soft bg-surface-2/70 dark:border-white/10 dark:bg-white/[0.04]",
    extra
  );
}

export function orbitBannerClass(extra?: string) {
  return cn(
    "rounded-sm border border-primary/30 bg-primary/10",
    extra
  );
}

export function orbitHoverRowClass() {
  return "hover:bg-accent-soft/60 dark:hover:bg-white/[0.03]";
}

export function orbitGhostButtonClass() {
  return "border-hairline-soft bg-surface-2/70 text-foreground hover:bg-accent-soft dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";
}

export function orbitMapLinkClass() {
  return "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-hairline-soft bg-surface-2/70 px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground dark:border-white/15 dark:bg-white/[0.045]";
}

export function orbitSelectionBarClass() {
  return "rounded-sm border border-hairline-soft bg-surface-1/95 backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(10,15,29,0.95),rgba(15,23,42,0.92))]";
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
