import { MarkMasterLogo } from "@/components/markmaster-logo";
import { feedPageWatermarkShellClass } from "@/lib/feed-page-watermark";
import { cn } from "@/lib/utils";

type DashboardPageWatermarkProps = {
  className?: string;
};

/**
 * Large, translucent MarkMaster rocket — shell-level tattoo under sidebar + feed.
 */
export function DashboardPageWatermark({ className }: DashboardPageWatermarkProps) {
  return (
    <div className={cn(feedPageWatermarkShellClass, className)} aria-hidden>
      <div className="relative h-full min-h-[32rem] w-full">
        <div className="absolute -left-16 top-[3.25rem] size-[32rem] rounded-full bg-primary/[0.05] blur-3xl" />
        <MarkMasterLogo
          width={480}
          height={480}
          className={cn(
            "absolute -left-[6%] top-[2.5rem] h-auto w-[min(40vw,32rem)] max-w-none",
            "opacity-[0.07] saturate-[0.55] mix-blend-soft-light",
            "dark:opacity-[0.085] dark:mix-blend-plus-lighter"
          )}
        />
        <MarkMasterLogo
          width={448}
          height={448}
          className={cn(
            "absolute left-[4%] top-[3.25rem] h-auto w-[min(38vw,30rem)] max-w-none",
            "opacity-[0.11] saturate-[0.7]",
            "dark:opacity-[0.13]"
          )}
        />
      </div>
    </div>
  );
}
