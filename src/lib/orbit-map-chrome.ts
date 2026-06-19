import { cn } from "@/lib/utils";

/** Map stage shell — follows app background in both themes. */
export function orbitMapStageClass(extra?: string) {
  return cn("rounded-sm border border-hairline-strong bg-background", extra);
}

/** Floating panel over the map canvas (search, stats, minimap frame). */
export function orbitMapFloatingShellClass(extra?: string) {
  return cn("map-glass rounded-sm text-foreground", extra);
}

/** Dropdown / menu anchored to map floating controls. */
export function orbitMapFloatingMenuClass(extra?: string) {
  return cn("map-glass rounded-sm text-foreground", extra);
}

export function orbitMapControlButtonClass(active: boolean) {
  return cn(
    "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-sm border border-transparent px-2.5 text-xs font-medium transition-colors backdrop-blur-xl focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
    active
      ? "border-hairline-soft bg-accent-soft text-foreground"
      : "text-muted-foreground hover:bg-accent-soft/60 hover:text-foreground"
  );
}

export function orbitMapZoomShellClass() {
  return cn(
    "pointer-events-auto inline-flex flex-col overflow-hidden map-glass rounded-sm"
  );
}

export function orbitMapZoomButtonClass() {
  return cn(
    "inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
  );
}

export function orbitMapZoomDividerClass() {
  return "h-px w-full bg-hairline-soft";
}
