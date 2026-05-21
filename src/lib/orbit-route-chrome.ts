import { orbital } from "@/components/orbital";
import { cn } from "@/lib/utils";

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
