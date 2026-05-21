import { cn } from "@/lib/utils";
import { orbital } from "@/components/orbital";

/** Shared review UI chrome — semantic tokens when Orbit theme is on, blue void otherwise. */
export function reviewChrome(isOrbital: boolean) {
  return {
    dialogShell: cn(
      isOrbital ? orbital.glass : "border border-white/10 bg-[#0b0f1a]",
      "max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-5xl"
    ),
    headerBorder: isOrbital ? "border-primary/10" : "border-white/10",
    muted: isOrbital ? "text-muted-foreground" : "text-white/60",
    soft: isOrbital ? "text-primary/55" : "text-white/45",
    body: isOrbital ? "text-foreground/90" : "text-white/90",
    bodyDim: isOrbital ? "text-muted-foreground" : "text-white/80",
    panel: isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-2/60"
      : "rounded-xl border border-white/10 bg-white/[0.04]",
    card: isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-1/80"
      : "rounded-xl border border-white/10 bg-white/[0.035]",
    cardSelected: isOrbital
      ? "border-primary/30 bg-primary/5"
      : "border-primary/25 bg-primary/10",
    toggleShell: isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-2/80 p-0.5"
      : "rounded-lg border border-white/10 bg-black/10 p-0.5",
    toggleActive: isOrbital
      ? "bg-primary text-primary-foreground shadow-sm"
      : "bg-white text-slate-950 shadow-sm",
    toggleIdle: isOrbital
      ? "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
      : "text-white/60 hover:bg-white/[0.08] hover:text-white",
    ghostBtn: isOrbital
      ? "border-hairline-soft bg-surface-2/70 text-foreground hover:bg-accent-soft"
      : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10",
    label: isOrbital ? orbital.label : "text-[10px] font-medium uppercase tracking-[0.14em] text-white/50",
    data: isOrbital ? orbital.data : "font-mono text-[10px] tabular-nums text-white/70",
    sheetShell: isOrbital
      ? "border-primary/10 bg-background text-foreground"
      : "border-white/10 bg-slate-950 text-white",
    collapsibleBtn: isOrbital
      ? "text-muted-foreground hover:text-foreground"
      : "text-white/50 hover:text-white/70",
    fieldShell: isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-1/50 p-3"
      : "rounded-xl border border-white/10 bg-white/[0.025] p-3",
    quickDecisionShell: isOrbital
      ? "rounded-sm border border-hairline-soft bg-surface-2/60 p-2 shadow-sm"
      : "rounded-xl border border-white/20 bg-white/[0.04] p-2 shadow-sm",
    footer: isOrbital
      ? "border-primary/10 text-muted-foreground/70"
      : "border-white/10 text-white/40",
    footerBar: isOrbital
      ? "border-primary/10 bg-background/95"
      : "border-white/10 bg-slate-950/95",
  };
}
