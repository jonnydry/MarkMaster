"use client";

import { useRouter } from "next/navigation";
import { Compass, Sparkles, RotateCcw, Plus } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import {
  HighlightScrollSlide,
  HighlightScrollStrip} from "@/components/highlight-scroll-strip";
import { HighlightCard } from "@/components/highlight-card";
import { ModuleHeader } from "@/components/module-header";
import { Button } from "@/components/ui/button";
import {
  useDashboardDiscovery,
  type DashboardDiscoveryParentData} from "@/hooks/use-dashboard-discovery";
import { useTypography } from "@/hooks/use-typography";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { cn } from "@/lib/utils";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import type { BookmarkWithRelations } from "@/types";
import type { DiscoveryCarouselItem } from "@/lib/weekly-gems-curation";
import { useDiscoveryRitual } from "@/hooks/use-discovery-ritual";

export interface DashboardDiscoveryProps {
  feedReady?: boolean;
  parentData?: DashboardDiscoveryParentData;
  activeBookmarkId?: string | null;
  onSelectBookmark?: (id: string) => void;
  onFocusForTriage?: (id: string) => void;
  onSaveAsCollection?: (bookmarks: BookmarkWithRelations[], suggestedName: string) => void;
  /** Override default Discovery header copy (e.g. collections context). */
  explainer?: string;
  /** default — align with the dashboard feed column; flush — span parent width (collections). */
  variant?: "default" | "flush";
  className?: string;
}

const variantShellClass: Record<NonNullable<DashboardDiscoveryProps["variant"]>, string> = {
  default: cn("mb-3", bookmarkFeedColumnClassName),
  flush: "mb-0 max-w-none px-0"};

export function DashboardDiscovery({
  feedReady = true,
  parentData,
  activeBookmarkId,
  onSelectBookmark,
  onFocusForTriage,
  onSaveAsCollection,
  explainer,
  variant = "default",
  className}: DashboardDiscoveryProps) {
  const router = useRouter();
  const t = useTypography();

  const {
    rawTotal = 0,
    isLoading,
    hasError,
    refetch,
    discoveryCarouselItems = [],
    ritualBatch = [],
    ritualTotal = 0,
    resurfacedCount = 0,
    discoveryEngagement = 0,
    itemLabels = {}} = useDashboardDiscovery({ feedReady, parentData });

  const shellClass = variantShellClass[variant];

  // Shared ritual logic (nurtured count, celebration, batch handlers).
  // Extracted to eliminate duplication with WeeklyDigestPanel while keeping
  // identical behavior and telemetry.
  const {
    nurturedCount,
    celebration,
    handleReviewInOrbit,
    handleSaveAsCollection} = useDiscoveryRitual({
    batch: ritualBatch,
    onSaveAsCollection});

  const handleOrbitReview = (id: string) => {
    trackFlywheelEvent("cta.review_in_orbit", {
      source: "discovery",
      bookmarkId: id});
    router.push(`/orbit?highlightId=${id}`);
  };

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

  // Updated for unified carousel (raw front-loaded high-performers + curated resurfaced/strong).
  // Replaces prior showQuickPicks + embedded WeeklyDigestPanel stack.
  // showModule now requires actual mix content (prevents empty frosted card shell when
  // feedReady=true but builder yields zero items/ritualBatch after load). Loading skeleton
  // still covers the fetch window; zero-content case returns null cleanly (no empty UI).
  const showModule = discoveryCarouselItems.length > 0 || ritualTotal > 0;

  if (!showModule) return null;

  // Unified single-carousel renderer for the Discovery card (dashboard + collections flush).
  // One HighlightScrollStrip combining raw high-performers (front-loaded, isRawMode) +
  // resurfaced/strong curated items (itemLabel badges for visual distinction).
  // Header pill + Ritual Anchor (final slide) are the first-class batch ritual CTAs.
  // All use the exact same machinery as before: handleReviewInOrbit, nurtured, celebration,
  // digestIds + source=weekly-gems, onSaveAsCollection("This Week’s Gems"), track cta.digest_review_together.
  // No changes to PerformanceHighlights, usePerformanceHighlights, or perf SQL.
  // ParentData + flush variant fully supported.
  // See Unified-High-Engagement-Discovery-Carousel-Plan.md (Phase 1).
  const hasRitual = ritualTotal > 0;
  const itemCountForStrip = discoveryCarouselItems.length + (hasRitual ? 1 : 0);
  const isFeedIntegrated = variant === "default";

  return (
    <section
      className={cn(shellClass, "w-full", className)}
      aria-label="Discovery"
    >
      <div
        className={cn(
          "overflow-hidden rounded-sm border",
          isFeedIntegrated
            ? "border-hairline-soft bg-background/55 shadow-none supports-[backdrop-filter]:bg-background/45"
            : cn(
                "border-hairline-strong pb-4 shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--foreground)_80%,transparent)]",
                appChromeFrostedClassName
              )
        )}
      >
        <div className="border-b border-hairline-soft px-4 py-3 sm:px-5">
          <ModuleHeader
            icon={Compass}
            eyebrow="Discovery"
            className="flex-col gap-2 sm:flex-row sm:gap-3"
            description={
              explainer ??
              "Highest-engagement posts from your library — prioritized for review."
            }
            meta={
              hasRitual
                ? `${ritualTotal} high-engagement • ${rawTotal.toLocaleString()} untouched • ${resurfacedCount} resurfaced`
                : undefined
            }
            action={
              hasRitual ? (
              <button
                type="button"
                onClick={handleReviewInOrbit}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-sm border border-hairline-soft bg-surface-1/60 px-2.5 text-[10px] font-medium uppercase tracking-[0.04em] text-primary transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:bg-accent-soft/60",
                  "max-sm:w-full max-sm:justify-center",
                  t.monoNative && t.label
                )}
                aria-label={`Review full mix of ${ritualTotal} gems in Orbit`}
              >
                <span className="inline-flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  Review full mix ({ritualTotal})
                </span>
              </button>
              ) : null
            }
          />
        </div>

        <div className="px-4 pt-3 sm:px-5">
          {/* Celebration banner (exact markup preserved for ritual reinforcement UX) */}
          {celebration ? (
            <div className="mb-3 rounded-sm border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-200">
                <Sparkles className="h-4 w-4" />
                <span>
                  Ritual reinforced — nurtured{" "}
                  <span className="font-medium tabular-nums">{celebration.gems}</span> gems
                  {celebration.engagement > 0 && (
                    <>
                      {" "}
                      · ~
                      <span className="font-medium tabular-nums">
                        {celebration.engagement.toLocaleString()}
                      </span>{" "}
                      engagement impact
                    </>
                  )}
                </span>
              </div>
            </div>
          ) : null}

          {itemCountForStrip > 0 ? (
            <HighlightScrollStrip
              ariaLabel="High-engagement discovery mix"
              itemCount={itemCountForStrip}
            >
              {discoveryCarouselItems.map((item: DiscoveryCarouselItem, index: number) => (
                <HighlightScrollSlide
                  key={item.bookmark.id}
                  index={index}
                  desktopTwoUp={!isFeedIntegrated}
                  className={isFeedIntegrated ? "w-full" : undefined}
                >
                  <HighlightCard
                    bookmark={item.bookmark}
                    index={index}
                    active={activeBookmarkId === item.bookmark.id}
                    itemLabel={itemLabels[item.bookmark.id]}
                    isRawMode={item.context === "raw"}
                    layout="carousel"
                    onSelect={onSelectBookmark}
                    onFocusForTriage={onFocusForTriage}
                    onOrbitReview={handleOrbitReview}
                  />
                </HighlightScrollSlide>
              ))}

              {/* Ritual Anchor as final slide — visually distinct strong CTA (second complementary affordance) */}
              {hasRitual && (
                <HighlightScrollSlide
                  key="ritual-anchor"
                  index={discoveryCarouselItems.length}
                  className={isFeedIntegrated ? "w-full" : undefined}
                >
                  <div
                    className={cn(
                      "relative flex h-full min-h-[10rem] flex-col items-center justify-center rounded-sm border bg-surface-1/55 p-3.5 text-center",
                      "border-primary/20 hover:border-primary/30"
                    )}
                  >
                    <span
                      className={cn(
                        t.data,
                        "absolute right-3.5 top-3.5 text-[10px] font-bold text-muted-foreground/55"
                      )}
                    >
                      {itemCountForStrip} / {itemCountForStrip}
                    </span>
                    <div className="flex max-w-full items-center justify-center gap-2">
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                      <span
                        className={cn(
                          "truncate text-[10px] font-bold uppercase tracking-[0.12em] text-primary",
                          t.monoNative && t.label
                        )}
                      >
                        Weekly Ritual
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-2 line-clamp-2 max-w-md text-[13px] font-semibold leading-5 text-foreground sm:text-sm",
                        t.monoNative && "text-mono-data"
                      )}
                    >
                      Review full mix together in Orbit
                    </p>
                    <div
                      className={cn(
                        "mt-1.5 line-clamp-1 max-w-md text-[10px] text-muted-foreground/65",
                        t.monoNative && t.label
                      )}
                    >
                      {ritualTotal} gems
                      {resurfacedCount > 0 ? ` · ${resurfacedCount} resurfaced` : ""}
                      {discoveryEngagement > 0
                        ? ` · ~${discoveryEngagement.toLocaleString()} engagements`
                        : ""}
                      {nurturedCount > 0 ? ` · ${nurturedCount} nurtured` : ""}
                    </div>

                    <div className="mt-3 flex w-full max-w-sm flex-wrap items-center justify-center gap-1.5 border-t border-hairline-soft/70 pt-2.5">
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-2.5 text-[10px]"
                        onClick={handleReviewInOrbit}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Review all
                      </Button>
                      {onSaveAsCollection ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2.5 text-[10px]"
                          onClick={handleSaveAsCollection}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Save as collection
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </HighlightScrollSlide>
              )}
            </HighlightScrollStrip>
          ) : null}
        </div>
      </div>
    </section>
  );
}
