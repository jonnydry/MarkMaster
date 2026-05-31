"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { useOrbitalTheme } from "@/components/providers";
import {
  dismissOrbitTriageHint,
  isOrbitTriageHintDismissed,
} from "@/lib/orbit-triage-hint";
import { orbitHairlineBorder, orbitMetaMuted } from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

export function OrbitTriageHint({ className }: { className?: string }) {
  const { isOrbital } = useOrbitalTheme();
  const [dismissed, setDismissed] = useState(() => isOrbitTriageHintDismissed());

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "relative mt-3 rounded-sm border px-3 py-2.5 text-xs leading-relaxed",
        orbitHairlineBorder(isOrbital),
        isOrbital
          ? "border-primary/15 bg-primary/5 text-muted-foreground"
          : "border-hairline-soft bg-surface-2/50 text-muted-foreground dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65",
        className
      )}
    >
      <button
        type="button"
        onClick={() => {
          dismissOrbitTriageHint();
          setDismissed(true);
        }}
        className={cn(
          "absolute right-1.5 top-1.5 rounded p-0.5",
          isOrbital
            ? "text-primary/50 hover:text-primary"
            : "text-muted-foreground hover:text-foreground dark:text-white/40 dark:hover:text-white/70"
        )}
        aria-label="Dismiss triage tips"
      >
        <X className="size-3.5" />
      </button>
      <p className={cn("pr-5 font-medium", orbitMetaMuted(isOrbital))}>
        How triage works
      </p>
      <ul className={cn("mt-1.5 list-inside list-disc space-y-0.5 pr-4", orbitMetaMuted(isOrbital))}>
        <li>
          <strong className={isOrbital ? "text-foreground/90" : "text-foreground/80 dark:text-white/80"}>
            Scan
          </strong>{" "}
          — Grok suggests tags and collections for the queue
        </li>
        <li>
          <strong className={isOrbital ? "text-foreground/90" : "text-foreground/80 dark:text-white/80"}>
            Row click
          </strong>{" "}
          — quick review in the side panel
        </li>
        <li>
          <strong className={isOrbital ? "text-foreground/90" : "text-foreground/80 dark:text-white/80"}>
            Review pass
          </strong>{" "}
          — batch review after a scan (when available)
        </li>
      </ul>
    </div>
  );
}
