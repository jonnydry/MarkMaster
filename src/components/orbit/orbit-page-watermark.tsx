import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { feedPageWatermarkShellClass } from "@/lib/feed-page-watermark";
import { cn } from "@/lib/utils";

type OrbitPageWatermarkProps = {
  className?: string;
};

/**
 * Large, translucent Orbit mark — shell-level tattoo under sidebar + feed.
 */
export function OrbitPageWatermark({ className }: OrbitPageWatermarkProps) {
  return (
    <div className={cn(feedPageWatermarkShellClass, className)} aria-hidden>
      <div className="relative h-full min-h-[32rem] w-full">
        <div className="absolute -left-16 top-[3.25rem] size-[32rem] rounded-full bg-primary/[0.05] blur-3xl" />
        <OrbitLogoMark
          className={cn(
            "absolute -left-[6%] top-[2.5rem] size-[min(40vw,32rem)]",
            "opacity-[0.08] saturate-[0.65] mix-blend-soft-light",
            "dark:opacity-[0.095] dark:mix-blend-plus-lighter"
          )}
        />
        <OrbitLogoMark
          className={cn(
            "absolute left-[4%] top-[3.25rem] size-[min(38vw,30rem)]",
            "opacity-[0.13] saturate-[0.75]",
            "dark:opacity-[0.15]"
          )}
        />
      </div>
    </div>
  );
}
