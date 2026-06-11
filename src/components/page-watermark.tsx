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

/* Two stacked layers per mark: a soft blended back layer and a crisper front. */
const WATERMARK_LAYERS: Record<
  PageWatermarkVariant,
  { back: ReactNode; front: ReactNode }
> = {
  markmaster: {
    back: (
      <MarkMasterLogo
        width={480}
        height={480}
        className={cn(
          "absolute -left-[6%] top-[2.5rem] h-auto w-[min(40vw,32rem)] max-w-none",
          "opacity-[0.07] saturate-[0.55] mix-blend-soft-light",
          "dark:opacity-[0.085] dark:mix-blend-plus-lighter"
        )}
      />
    ),
    front: (
      <MarkMasterLogo
        width={448}
        height={448}
        className={cn(
          "absolute left-[4%] top-[3.25rem] h-auto w-[min(38vw,30rem)] max-w-none",
          "opacity-[0.11] saturate-[0.7]",
          "dark:opacity-[0.13]"
        )}
      />
    ),
  },
  orbit: {
    back: (
      <OrbitLogoMark
        className={cn(
          "absolute -left-[6%] top-[2.5rem] size-[min(40vw,32rem)]",
          "opacity-[0.08] saturate-[0.65] mix-blend-soft-light",
          "dark:opacity-[0.095] dark:mix-blend-plus-lighter"
        )}
      />
    ),
    front: (
      <OrbitLogoMark
        className={cn(
          "absolute left-[4%] top-[3.25rem] size-[min(38vw,30rem)]",
          "opacity-[0.13] saturate-[0.75]",
          "dark:opacity-[0.15]"
        )}
      />
    ),
  },
};

/**
 * Large, translucent brand mark — shell-level tattoo under sidebar + feed.
 */
export function PageWatermark({ variant, className }: PageWatermarkProps) {
  const layers = WATERMARK_LAYERS[variant];
  return (
    <div className={cn(feedPageWatermarkShellClass, className)} aria-hidden>
      <div className="relative h-full min-h-[32rem] w-full">
        <div className="absolute -left-16 top-[3.25rem] size-[32rem] rounded-full bg-primary/[0.05] blur-3xl" />
        {layers.back}
        {layers.front}
      </div>
    </div>
  );
}
