"use client";

import { useSyncExternalStore } from "react";
import { Sparkles, X } from "lucide-react";

import {
  dismissOrbitTriageHint,
  isOrbitTriageHintDismissed} from "@/lib/orbit-triage-hint";
import { orbitHairlineBorder, orbitMetaMuted } from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

const TRIAGE_HINT_CHANGE_EVENT = "markmaster-orbit-triage-hint-change";

function subscribeToTriageHint(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", callback);
  window.addEventListener(TRIAGE_HINT_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TRIAGE_HINT_CHANGE_EVENT, callback);
  };
}

export function OrbitTriageHint({ className }: { className?: string }) {
  const dismissed = useSyncExternalStore(
    subscribeToTriageHint,
    isOrbitTriageHintDismissed,
    () => false
  );

  if (dismissed) return null;

  const strong = "font-medium text-foreground/85 dark:text-white/85";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm border px-3 py-2 text-[11px] leading-relaxed",
        orbitHairlineBorder(),
        "border-hairline-soft bg-surface-2/50 dark:border-white/10 dark:bg-white/[0.03]",
        orbitMetaMuted(),
        className
      )}
    >
      <Sparkles className="size-3.5 shrink-0 text-primary/70" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className={strong}>Scan</span> with Grok, then{" "}
        <span className={strong}>Accept</span> ·{" "}
        <span className={strong}>Skip</span> ·{" "}
        <span className={strong}>Edit</span> each row inline — or open the{" "}
        <span className={strong}>Review pass</span> for the whole batch.{" "}
        <span className="hidden sm:inline">Press ? for shortcuts.</span>
      </p>
      <button
        type="button"
        onClick={() => {
          dismissOrbitTriageHint();
          window.dispatchEvent(new Event(TRIAGE_HINT_CHANGE_EVENT));
        }}
        className={cn(
          "shrink-0 rounded p-0.5",
          "text-muted-foreground hover:text-foreground dark:text-white/40 dark:hover:text-white/70"
        )}
        aria-label="Dismiss triage tips"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
