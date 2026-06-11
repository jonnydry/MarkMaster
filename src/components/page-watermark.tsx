import type { ReactNode } from "react";

import { MarkMasterLogo } from "@/components/markmaster-logo";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import {
  collectionsPageWatermarkShellClass,
  feedPageWatermarkShellClass,
} from "@/lib/feed-page-watermark";
import { cn } from "@/lib/utils";

type PageWatermarkVariant = "markmaster" | "orbit" | "collections";

type PageWatermarkProps = {
  variant: PageWatermarkVariant;
  className?: string;
};

/*
 * One treatment for every brand watermark: a single layer (no offset echo),
 * theme tint without the header logo's glow, low opacity, and a bottom-left
 * corner anchor so the mark rises partially into frame — ambient texture,
 * not a poster. Rem offsets (not %) keep the mark from jumping when the
 * viewport height changes (terminal panel, browser resize). The dense
 * dashboard feed runs quieter than the sparse Orbit queue, which is the
 * only per-variant difference besides the mark itself.
 */
const WATERMARK_MARKS: Record<
  Exclude<PageWatermarkVariant, "collections">,
  ReactNode
> = {
  markmaster: (
    <MarkMasterLogo
      width={480}
      height={480}
      glow={false}
      // No Tailwind filter utilities here: they'd override the theme-tint
      // filter from .markmaster-logo-flat (both set `filter`).
      className={cn(
        "absolute -bottom-[7rem] -left-[2.75rem] h-auto w-[min(36vw,28rem)] max-w-none",
        "opacity-[0.06]",
        "dark:opacity-[0.1]"
      )}
    />
  ),
  orbit: (
    <OrbitLogoMark
      className={cn(
        "absolute -bottom-[8rem] -left-[3.25rem] size-[min(38vw,30rem)]",
        "opacity-[0.08] saturate-[0.7]",
        "dark:opacity-[0.11]"
      )}
    />
  ),
};

/**
 * Large, translucent brand mark — shell-level tattoo under sidebar + feed.
 */
export function PageWatermark({ variant, className }: PageWatermarkProps) {
  if (variant === "collections") {
    return (
      <div
        className={cn(collectionsPageWatermarkShellClass, className)}
        aria-hidden
      >
        <div className="relative h-[min(88vh,52rem)] w-[min(108vw,68rem)]">
          <div className="absolute left-1/2 top-[46%] size-[min(40vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute left-1/2 top-[46%] size-[min(28vw,17rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-note/[0.05] blur-3xl" />
          <MarkMasterLogo
            width={640}
            height={640}
            glow={false}
            className={cn(
              "absolute left-1/2 top-[46%] z-0 h-auto w-[min(62vw,42rem)] max-w-none",
              "-translate-x-[104%] -translate-y-[48%]",
              "rotate-[34deg]",
              "opacity-[0.045]",
              "dark:opacity-[0.075]"
            )}
          />
          <OrbitLogoMark
            className={cn(
              "absolute left-1/2 top-[46%] z-10 size-[min(66vw,44rem)]",
              "translate-x-[4%] -translate-y-[44%]",
              "-scale-x-100 -rotate-[30deg]",
              "opacity-[0.06] saturate-[0.65]",
              "dark:opacity-[0.09]"
            )}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(feedPageWatermarkShellClass, className)} aria-hidden>
      <div className="relative h-full min-h-[32rem] w-full">
        <div className="absolute -left-20 bottom-12 size-[28rem] rounded-full bg-primary/[0.05] blur-3xl" />
        {WATERMARK_MARKS[variant]}
      </div>
    </div>
  );
}
