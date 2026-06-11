import type { ReactNode } from "react";

import { MarkMasterLogo } from "@/components/markmaster-logo";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { feedPageWatermarkShellClass } from "@/lib/feed-page-watermark";
import { cn } from "@/lib/utils";

type PageWatermarkVariant = "markmaster" | "orbit";

type PageWatermarkProps = {
  variant: PageWatermarkVariant;
  className?: string;
};

/*
 * One treatment for every brand watermark: a single layer (no offset echo),
 * theme tint without the header logo's glow, low opacity, and a bottom-left
 * corner anchor so the mark rises partially into frame — ambient texture,
 * not a poster. The dense dashboard feed runs quieter than the sparse Orbit
 * queue, which is the only per-variant difference besides the mark itself.
 */
const WATERMARK_MARKS: Record<PageWatermarkVariant, ReactNode> = {
  markmaster: (
    <MarkMasterLogo
      width={480}
      height={480}
      glow={false}
      className={cn(
        "absolute -bottom-[14%] -left-[8%] h-auto w-[min(36vw,28rem)] max-w-none",
        "opacity-[0.05] saturate-[0.6]",
        "dark:opacity-[0.07]"
      )}
    />
  ),
  orbit: (
    <OrbitLogoMark
      className={cn(
        "absolute -bottom-[16%] -left-[10%] size-[min(38vw,30rem)]",
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
  return (
    <div className={cn(feedPageWatermarkShellClass, className)} aria-hidden>
      <div className="relative h-full min-h-[32rem] w-full">
        <div className="absolute -left-20 bottom-12 size-[28rem] rounded-full bg-primary/[0.05] blur-3xl" />
        {WATERMARK_MARKS[variant]}
      </div>
    </div>
  );
}
