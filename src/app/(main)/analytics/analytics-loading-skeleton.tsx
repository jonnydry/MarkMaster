import { cn } from "@/lib/utils";

export function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3 border-b border-hairline-soft pb-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-16 rounded-sm skeleton-shimmer" />
              <div className="h-6 w-12 rounded-sm skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="h-1.5 w-full rounded-[2px] skeleton-shimmer" />
      </div>
      <div className="flex gap-4 border-b border-hairline-soft pb-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-4 w-16 rounded-sm skeleton-shimmer" />
        ))}
      </div>
      <div className={cn("h-64 rounded-sm border border-hairline-soft skeleton-shimmer")} />
    </div>
  );
}
