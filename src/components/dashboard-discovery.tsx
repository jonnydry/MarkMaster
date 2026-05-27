"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { PerformanceHighlights } from "@/components/performance-highlights";
import { WeeklyDigestPanel } from "@/components/weekly-digest-panel";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import {
  useDashboardDiscovery,
  type DashboardDiscoveryParentData,
} from "@/hooks/use-dashboard-discovery";
import { useTypography } from "@/hooks/use-typography";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { cn } from "@/lib/utils";
import { appChromeFrostedClassName, appContentGutterClassName } from "@/lib/app-chrome";
import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";
import type { BookmarkWithRelations } from "@/types";

export interface DashboardDiscoveryProps {
  feedReady?: boolean;
  parentData?: DashboardDiscoveryParentData;
  activeBookmarkId?: string | null;
  onSelectBookmark?: (id: string) => void;
  onFocusForTriage?: (id: string) => void;
  onSaveAsCollection?: (bookmarks: BookmarkWithRelations[], suggestedName: string) => void;
  quickPicksSubtitle?: string;
  /** Override default Discovery header copy (e.g. collections context). */
  explainer?: string;
  /** flush — span parent width without outer gutter/max-width (collections). */
  variant?: "default" | "flush";
  className?: string;
}

const variantShellClass: Record<NonNullable<DashboardDiscoveryProps["variant"]>, string> = {
  default: cn("mx-auto mb-3 max-w-[960px]", appContentGutterClassName),
  flush: "mb-0 max-w-none px-0",
};

export function DashboardDiscovery({
  feedReady = true,
  parentData,
  activeBookmarkId,
  onSelectBookmark,
  onFocusForTriage,
  onSaveAsCollection,
  quickPicksSubtitle,
  explainer,
  variant = "default",
  className,
}: DashboardDiscoveryProps) {
  const router = useRouter();
  const { isOrbital } = useOrbitalTheme();
  const t = useTypography();

  const {
    quickPicks,
    quickPickIds,
    rawTotal,
    libraryGems,
    hasDigestBatch,
    isLoading,
    hasError,
    refetch,
  } = useDashboardDiscovery({ feedReady, parentData });

  const defaultDigestCollapsed = useMemo(() => !hasDigestBatch, [hasDigestBatch]);
  const shellClass = variantShellClass[variant];

  if (isLoading) {
    return (
      <div
        className={cn(shellClass, "space-y-2", className)}
        aria-busy
        aria-label="Loading Discovery"
      >
        <div className="h-4 w-32 rounded skeleton-shimmer" />
        <div className="h-24 rounded-sm border border-hairline-soft skeleton-shimmer" />
      </div>
    );
  }

  if (hasError) {
    return (
      <ErrorState
        layout="inline"
        title="Could not load Discovery."
        action={
          <RetryButton onClick={() => refetch()} className="mt-0 shrink-0" />
        }
        className={cn(shellClass, className)}
      />
    );
  }

  const showQuickPicks = quickPicks.length > 0;
  const showModule = showQuickPicks || feedReady;

  if (!showModule) return null;

  return (
    <section
      className={cn(shellClass, "w-full", className)}
      aria-label="Discovery"
    >
      <div
        className={cn(
          "overflow-hidden rounded-sm border border-hairline-strong pb-4 shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--foreground)_80%,transparent)]",
          appChromeFrostedClassName
        )}
      >
        <div className="border-b border-hairline-soft px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <div
              className={
                isOrbital
                  ? cn(orbital.icon, "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm")
                  : "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary"
              }
            >
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <p
                className={cn(
                  t.sectionLabel,
                  "mb-0 text-primary/70",
                  !isOrbital && "text-muted-foreground"
                )}
              >
                Discovery
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {explainer ??
                  "High-performing posts from X — quick picks to triage, plus a weekly mix when you want a batch pass."}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-3 sm:px-5">
          {showQuickPicks ? (
            <PerformanceHighlights
              title="Quick picks"
              subtitle={
                quickPicksSubtitle ??
                `${rawTotal.toLocaleString()} untouched high-performers`
              }
              bookmarks={quickPicks}
              total={rawTotal}
              activeBookmarkId={activeBookmarkId}
              onSelect={onSelectBookmark}
              onFocusForTriage={onFocusForTriage}
              onOrbitReview={(id) => {
                trackFlywheelEvent("cta.review_in_orbit", {
                  source: "highlights",
                  bookmarkId: id,
                });
                router.push(`/orbit?highlightId=${id}`);
              }}
              isRawMode={true}
              layout="strip"
              className="px-0 pb-0 pt-0"
            />
          ) : null}

          {feedReady ? (
            <WeeklyDigestPanel
              rawGems={quickPicks}
              libraryGems={libraryGems}
              rawTotal={rawTotal}
              excludeIds={quickPickIds}
              defaultCollapsed={defaultDigestCollapsed}
              embedded={showQuickPicks}
              onSaveAsCollection={onSaveAsCollection}
              onSelectBookmark={onSelectBookmark}
              className={showQuickPicks ? undefined : "border-t-0 pt-0"}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
