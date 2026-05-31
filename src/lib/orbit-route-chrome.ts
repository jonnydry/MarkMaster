import { orbital } from "@/components/orbital";
import { cn } from "@/lib/utils";

/** Classic void keeps softer corners; orbital defers to Button default (rounded-sm). */
export function orbitControlRadius(isOrbital: boolean) {
  return isOrbital ? undefined : "rounded-lg";
}

/** Shell wrapper for /orbit routes. Classic mode follows the app light/dark color mode. */
export function orbitShellClass(isOrbital: boolean) {
  return cn(
    "app-shell-bg app-viewport flex overflow-hidden",
    !isOrbital && "orbit-route-default"
  );
}

export function orbitLabelClass(isOrbital: boolean, extra?: string) {
  return cn(
    isOrbital
      ? orbital.label
      : "text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground dark:text-white/55",
    extra
  );
}

export function orbitDataClass(isOrbital: boolean, extra?: string) {
  return cn(
    isOrbital ? orbital.data : "font-mono text-[10px] tabular-nums",
    extra
  );
}

export function orbitSectionLabelClass(isOrbital: boolean, extra?: string) {
  return cn(isOrbital ? orbital.sectionLabel : orbitLabelClass(false, extra));
}

export function orbitHairlineBorder(isOrbital: boolean) {
  return isOrbital ? "border-hairline-soft" : "border-hairline-soft dark:border-white/10";
}

export function orbitMetaMuted(isOrbital: boolean) {
  return isOrbital ? "text-primary/55" : "text-muted-foreground dark:text-white/55";
}

export function orbitMetaSoft(isOrbital: boolean) {
  return isOrbital ? "text-primary/60" : "text-muted-foreground dark:text-white/60";
}

export function orbitForeground(isOrbital: boolean) {
  return isOrbital ? "text-foreground" : "text-foreground dark:text-white";
}

export function orbitPanelClass(isOrbital: boolean, extra?: string) {
  return cn(
    isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-2/70"
      : "rounded-lg border border-hairline-soft bg-surface-2/70 dark:border-white/10 dark:bg-white/[0.04]",
    extra
  );
}

export function orbitBannerClass(isOrbital: boolean, extra?: string) {
  return cn(
    isOrbital
      ? "rounded-sm border border-primary/30 bg-primary/10"
      : "rounded-sm border border-primary/30 bg-primary/10",
    extra
  );
}

export function orbitHoverRowClass(isOrbital: boolean) {
  return isOrbital ? "hover:bg-accent-soft/50" : "hover:bg-accent-soft/60 dark:hover:bg-white/[0.03]";
}

export function orbitGhostButtonClass(isOrbital: boolean) {
  return isOrbital
    ? "border-hairline-soft bg-surface-2/70 text-foreground hover:bg-accent-soft"
    : "border-hairline-soft bg-surface-2/70 text-foreground hover:bg-accent-soft dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";
}

export function orbitMapLinkClass(isOrbital: boolean) {
  return isOrbital
    ? "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-hairline-soft bg-surface-2/70 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
    : "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-hairline-soft bg-surface-2/70 px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground dark:border-white/15 dark:bg-white/[0.045]";
}

export function orbitSelectionBarClass(isOrbital: boolean) {
  return isOrbital
    ? "rounded-sm border border-hairline-soft glass-orbital"
    : "rounded-sm border border-hairline-soft bg-surface-1/95 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(10,15,29,0.95),rgba(15,23,42,0.92))]";
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
