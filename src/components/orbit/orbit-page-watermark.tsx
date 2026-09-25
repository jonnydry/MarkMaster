import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { cn } from "@/lib/utils";

/**
 * Faint Orbit marks behind the queue and map. Two offset copies of the same
 * mark, cropped at the lower left, so the page reads as Orbit without a poster.
 */
export function OrbitPageWatermark() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-0 hidden w-[min(72%,34rem)] overflow-visible md:block"
      aria-hidden
    >
      <div className="relative h-full min-h-[32rem] w-full">
        <OrbitLogoMark
          className={cn(
            "absolute -left-[8%] top-[8%] size-[min(42vw,32rem)]",
            "opacity-[0.1] saturate-[0.7] mix-blend-soft-light",
            "dark:opacity-[0.16] dark:mix-blend-plus-lighter"
          )}
        />
        <OrbitLogoMark
          className={cn(
            "absolute left-[22%] top-[18%] size-[min(34vw,26rem)]",
            "opacity-[0.07] saturate-[0.65]",
            "dark:opacity-[0.11] dark:mix-blend-plus-lighter"
          )}
        />
      </div>
    </div>
  );
}
