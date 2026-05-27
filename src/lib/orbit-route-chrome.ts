import { orbital } from "@/components/orbital";
import { cn } from "@/lib/utils";

/** Classic void keeps softer corners; orbital defers to Button default (rounded-sm). */
export function orbitControlRadius(isOrbital: boolean) {
  return isOrbital ? undefined : "rounded-lg";
}

/** Shell wrapper for /orbit routes when Orbit theme toggle is off (classic blue void). */
export function orbitShellClass(isOrbital: boolean) {
  return cn(
    "app-shell-bg app-viewport flex overflow-hidden",
    !isOrbital && "orbit-route-default bg-[#070b13] text-white"
  );
}

export function orbitLabelClass(isOrbital: boolean, extra?: string) {
  return cn(
    isOrbital
      ? orbital.label
      : "text-[10px] font-medium uppercase tracking-[0.18em] text-white/55",
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
  return isOrbital ? "border-hairline-soft" : "border-white/10";
}

export function orbitMetaMuted(isOrbital: boolean) {
  return isOrbital ? "text-primary/55" : "text-white/55";
}

export function orbitMetaSoft(isOrbital: boolean) {
  return isOrbital ? "text-primary/60" : "text-white/60";
}

export function orbitForeground(isOrbital: boolean) {
  return isOrbital ? "text-foreground" : "text-white";
}

export function orbitPanelClass(isOrbital: boolean, extra?: string) {
  return cn(
    isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-2/70"
      : "rounded-lg border border-white/10 bg-white/[0.04]",
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
  return isOrbital ? "hover:bg-accent-soft/50" : "hover:bg-white/[0.03]";
}

export function orbitGhostButtonClass(isOrbital: boolean) {
  return isOrbital
    ? "border-hairline-soft bg-surface-2/70 text-foreground hover:bg-accent-soft"
    : "border-white/15 bg-white/5 text-white hover:bg-white/10";
}

export function orbitMapLinkClass(isOrbital: boolean) {
  return isOrbital
    ? "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-hairline-soft bg-surface-2/70 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
    : "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-white/15 bg-white/[0.045] px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground";
}

export function orbitSelectionBarClass(isOrbital: boolean) {
  return isOrbital
    ? "rounded-sm border border-hairline-soft glass-orbital"
    : "rounded-sm border border-white/10 bg-[linear-gradient(180deg,rgba(10,15,29,0.95),rgba(15,23,42,0.92))] shadow-xl backdrop-blur-md";
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
