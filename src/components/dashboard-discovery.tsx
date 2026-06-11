"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Compass, Sparkles, RotateCcw, Plus, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import {
  HighlightScrollSlide,
  HighlightScrollStrip,
} from "@/components/highlight-scroll-strip";
import { HighlightCard } from "@/components/highlight-card";
import { ModuleHeader } from "@/components/module-header";
import { Button } from "@/components/ui/button";
import {
  useDashboardDiscovery,
  type DashboardDiscoveryParentData,
} from "@/hooks/use-dashboard-discovery";
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
  /** default — chromeless strip aligned with feed; flush — frosted module (collections). */
  variant?: "default" | "flush";
  className?: string;
}

const variantShellClass: Record<NonNullable<DashboardDiscoveryProps["variant"]>, string> = {
  default: cn("border-b border-hairline-soft pb-2 pt-0.5", bookmarkFeedColumnClassName),
  flush: "mb-0 max-w-none px-0",
};

function DiscoveryFeedHeader({
  meta,
  hint,
  actions,
}: {
  meta?: string;
  hint?: string;
  actions: ReactNode;
}) {
  const t = useTypography();

  return (
    <div
      className="mb-1 flex items-center justify-between gap-2"
      title={hint}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Compass className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <p className={cn(t.sectionLabel, "truncate text-muted-foreground")}>
          <span className="text-primary/70">Discovery</span>
          {meta ? (
            <>
              <span className="mx-1 text-muted-foreground/35" aria-hidden>
                ·
              </span>
              <span className="font-normal normal-case tracking-normal text-muted-foreground/65">
                {meta}
              </span>
            </>
          ) : null}
        </p>
      </div>
      {actions}
    </div>
  );
}

function DiscoveryCelebration({
  celebration,
  className,
}: {
  celebration: { gems: number; engagement: number };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 text-emerald-200">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>
          Nurtured{" "}
          <span className="font-medium tabular-nums">{celebration.gems}</span> gems
          {celebration.engagement > 0 && (
            <>
              {" "}
              · ~
              <span className="font-medium tabular-nums">
                {celebration.engagement.toLocaleString()}
              </span>{" "}
              engagement
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function DiscoveryHeaderActions({
  hasRitual,
  ritualTotal,
  onRefresh,
  onReview,
  onSave,
  showSave,
  dense,
}: {
  hasRitual: boolean;
  ritualTotal: number;
  onRefresh: () => void;
  onReview: () => void;
  onSave?: () => void;
  showSave: boolean;
  /** Tighter toolbar-style controls for the dashboard feed strip. */
  dense?: boolean;
}) {
  const btnClass = dense ? "h-7 gap-1 px-2 text-xs" : "h-8 gap-1.5";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRefresh}
        className={btnClass}
        aria-label="Refresh discovery mix with different untouched posts"
      >
        <RefreshCw className="h-3 w-3" />
        {dense ? null : "Refresh"}
      </Button>
      {hasRitual ? (
        <>
          <Button
            type="button"
            variant="highlight"
            size="sm"
            onClick={onReview}
            className={btnClass}
            aria-label={`Review all ${ritualTotal} in Orbit`}
          >
            <RotateCcw className="h-3 w-3" />
            Review{dense ? ` (${ritualTotal})` : ` all (${ritualTotal})`}
          </Button>
          {showSave && onSave ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSave}
              className={btnClass}
              aria-label="Save discovery mix as collection"
            >
              <Plus className="h-3 w-3" />
              {dense ? null : "Save"}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function DashboardDiscovery({
  feedReady = true,
  parentData,
  activeBookmarkId,
  onSelectBookmark,
  onFocusForTriage,
  onSaveAsCollection,
  explainer,
  variant = "default",
  className,
}: DashboardDiscoveryProps) {
  const router = useRouter();
  const t = useTypography();

  const {
    rawTotal = 0,
    isLoading,
    hasError,
    refetch,
    refreshMix,
    discoveryCarouselItems = [],
    ritualBatch = [],
    ritualTotal = 0,
    resurfacedCount = 0,
    discoveryEngagement = 0,
    itemLabels = {},
  } = useDashboardDiscovery({ feedReady, parentData });

  const shellClass = variantShellClass[variant];
  const isFeedIntegrated = variant === "default";

  const {
    nurturedCount,
    celebration,
    handleReviewInOrbit,
    handleSaveAsCollection,
  } = useDiscoveryRitual({
    batch: ritualBatch,
    onSaveAsCollection,
  });

  const handleOrbitReview = (id: string) => {
    trackFlywheelEvent("cta.review_in_orbit", {
      source: "discovery",
      bookmarkId: id,
    });
    router.push(`/orbit?highlightId=${id}`);
  };

  const handleRefreshMix = () => {
    trackFlywheelEvent("discovery.refresh_clicked", {
      shown: discoveryCarouselItems.length,
      rawPool: rawTotal,
    });
    refreshMix();
  };

  const defaultExplainer =
    "Popular untouched saves — tag or collect them to clear the queue.";
  const feedMetaLine =
    rawTotal > 0 ? `${rawTotal.toLocaleString()} untouched` : undefined;
  const moduleMetaLine =
    rawTotal > 0
      ? `${rawTotal.toLocaleString()} waiting for triage${
          resurfacedCount > 0 ? ` · ${resurfacedCount} resurfaced` : ""
        }`
      : undefined;

  if (isLoading) {
    return (
      <div
        className={cn(shellClass, "space-y-2", className)}
        aria-busy
        aria-label="Loading Discovery"
      >
        <div className="h-4 w-28 rounded skeleton-shimmer" />
        <div
          className={cn(
            "h-20 skeleton-shimmer",
            !isFeedIntegrated && "rounded-sm border border-hairline-soft"
          )}
        />
      </div>
    );
  }

  if (hasError) {
    return (
      <ErrorState
        layout="inline"
        title="Could not load Discovery."
        action={<RetryButton onClick={() => refetch()} className="mt-0 shrink-0" />}
        className={cn(shellClass, className)}
      />
    );
  }

  const showModule = discoveryCarouselItems.length > 0 || ritualTotal > 0;
  if (!showModule) return null;

  const hasRitual = ritualTotal > 0;
  const headerActions = (
    <DiscoveryHeaderActions
      hasRitual={hasRitual}
      ritualTotal={ritualTotal}
      onRefresh={handleRefreshMix}
      onReview={handleReviewInOrbit}
      onSave={handleSaveAsCollection}
      showSave={Boolean(onSaveAsCollection)}
      dense={isFeedIntegrated}
    />
  );

  const carouselSlides = discoveryCarouselItems.map(
    (item: DiscoveryCarouselItem, index: number) => (
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
          onOrbitReview={isFeedIntegrated ? undefined : handleOrbitReview}
        />
      </HighlightScrollSlide>
    )
  );

  const flushRitualAnchor =
    !isFeedIntegrated && hasRitual ? (
      <HighlightScrollSlide
        key="ritual-anchor"
        index={discoveryCarouselItems.length}
      >
        <div
          className={cn(
            "relative flex h-full min-h-[10rem] flex-col items-center justify-center rounded-sm border bg-surface-1/55 p-3.5 text-center",
            "border-primary/20 hover:border-primary/30"
          )}
        >
          <div className="flex max-w-full items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span
              className={cn(
                "truncate text-2xs font-bold uppercase tracking-[0.08em] text-primary",
                t.monoNative && t.label
              )}
            >
              Weekly Ritual
            </span>
          </div>
          <p className="mt-2 line-clamp-2 max-w-md text-sm font-semibold text-foreground">
            Review full mix together in Orbit
          </p>
          <p
            className={cn(
              "mt-1.5 line-clamp-1 max-w-md text-2xs text-muted-foreground/65",
              t.monoNative && t.label
            )}
          >
            {ritualTotal} gems
            {resurfacedCount > 0 ? ` · ${resurfacedCount} resurfaced` : ""}
            {discoveryEngagement > 0
              ? ` · ~${discoveryEngagement.toLocaleString()} engagements`
              : ""}
            {nurturedCount > 0 ? ` · ${nurturedCount} nurtured` : ""}
          </p>
          <div className="mt-3 flex w-full max-w-sm flex-wrap items-center justify-center gap-1.5 border-t border-hairline-soft/70 pt-2.5">
            <Button
              size="sm"
              variant="highlight"
              className="h-7 gap-1 px-2.5 text-2xs text-primary"
              onClick={handleReviewInOrbit}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Review all
            </Button>
            {onSaveAsCollection ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2.5 text-2xs"
                onClick={handleSaveAsCollection}
              >
                <Plus className="h-3.5 w-3.5" />
                Save as collection
              </Button>
            ) : null}
          </div>
        </div>
      </HighlightScrollSlide>
    ) : null;

  const stripItemCount =
    discoveryCarouselItems.length + (flushRitualAnchor ? 1 : 0);

  if (isFeedIntegrated) {
    return (
      <section
        className={cn(shellClass, "w-full", className)}
        aria-label="Discovery"
        title={explainer ?? defaultExplainer}
      >
        <DiscoveryFeedHeader
          meta={feedMetaLine}
          hint={explainer ?? defaultExplainer}
          actions={headerActions}
        />
        {celebration ? (
          <DiscoveryCelebration celebration={celebration} className="mb-1.5" />
        ) : null}
        {discoveryCarouselItems.length > 0 ? (
          <HighlightScrollStrip
            ariaLabel="Untouched high-engagement saves"
            itemCount={discoveryCarouselItems.length}
          >
            {carouselSlides}
          </HighlightScrollStrip>
        ) : null}
      </section>
    );
  }

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
          <ModuleHeader
            icon={Compass}
            eyebrow="Discovery"
            className="flex-col gap-2 sm:flex-row sm:gap-3"
            description={explainer ?? defaultExplainer}
            meta={moduleMetaLine}
            action={headerActions}
          />
        </div>

        <div className="px-4 pt-3 sm:px-5">
          {celebration ? (
            <DiscoveryCelebration celebration={celebration} className="mb-3" />
          ) : null}

          {stripItemCount > 0 ? (
            <HighlightScrollStrip
              ariaLabel="High-engagement discovery mix"
              itemCount={stripItemCount}
            >
              {carouselSlides}
              {flushRitualAnchor}
            </HighlightScrollStrip>
          ) : null}
        </div>
      </div>
    </section>
  );
}
