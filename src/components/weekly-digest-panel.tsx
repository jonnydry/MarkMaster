"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Sparkles, Plus, RotateCcw } from "lucide-react";
import { DiscoveryBatchBar } from "@/components/discovery-batch-bar";
import { HighlightCard } from "@/components/highlight-card";
import {
  HighlightScrollSlide,
  HighlightScrollStrip,
} from "@/components/highlight-scroll-strip";
import { Button } from "@/components/ui/button";
import { trackFlywheelEvent } from "@/lib/flywheel";
import {
  buildDigestItemLabels,
  buildWeeklyGemsCuration,
  computeDigestEngagement,
} from "@/lib/weekly-gems-curation";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";
import type { BookmarkWithRelations } from "@/types";

const NURTURED_STORAGE_KEY = "markmaster:digest-nurtured";

export interface WeeklyDigestPanelProps {
  rawGems: BookmarkWithRelations[];
  libraryGems: BookmarkWithRelations[];
  rawTotal: number;
  /** Exclude quick-pick IDs so the same bookmark is not shown twice in Discovery. */
  excludeIds?: Set<string>;
  defaultCollapsed?: boolean;
  embedded?: boolean;
  onSaveAsCollection?: (bookmarks: BookmarkWithRelations[], suggestedName: string) => void;
  onSelectBookmark?: (id: string) => void;
  className?: string;
}

export function WeeklyDigestPanel({
  rawGems,
  libraryGems,
  rawTotal,
  excludeIds,
  defaultCollapsed = false,
  embedded = false,
  onSaveAsCollection,
  onSelectBookmark,
  className,
}: WeeklyDigestPanelProps) {
  const router = useRouter();
  const { isOrbital } = useOrbitalTheme();
  const [expanded, setExpanded] = useState(false);
  const [digestOpen, setDigestOpen] = useState(!defaultCollapsed);
  const [nurturedCount, setNurturedCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const n = parseInt(localStorage.getItem(NURTURED_STORAGE_KEY) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  });
  const [celebration, setCelebration] = useState<null | { gems: number; engagement: number }>(
    null
  );

  const curation = useMemo(
    () => buildWeeklyGemsCuration(rawGems, libraryGems, { expanded, excludeIds }),
    [rawGems, libraryGems, expanded, excludeIds]
  );

  const { resurfacedGems, allGems, displayGems } = curation;
  const overlapWithQuickPicks = excludeIds
    ? curation.primaryGems.filter((g) => excludeIds.has(g.id)).length
    : 0;
  const batchGems = useMemo(() => {
    if (!excludeIds?.size) return allGems;
    const fromQuickPicks = curation.primaryGems.filter((g) => excludeIds.has(g.id));
    return [...fromQuickPicks, ...allGems];
  }, [allGems, curation.primaryGems, excludeIds]);

  const itemLabels = buildDigestItemLabels(resurfacedGems);
  const hasGems = allGems.length > 0 || overlapWithQuickPicks > 0;
  const totalEngagement = computeDigestEngagement(allGems);
  const totalMixCount = allGems.length + overlapWithQuickPicks;
  const extraBeyondQuickPicks = allGems.length;
  const showExtrasStrip = displayGems.length >= 2;

  const collapsedSummary = hasGems
    ? `${totalMixCount} in this week's mix${
        overlapWithQuickPicks > 0 ? ` · ${overlapWithQuickPicks} in Quick picks` : ""
      }${
        extraBeyondQuickPicks > 0
          ? ` · +${extraBeyondQuickPicks} extra gem${extraBeyondQuickPicks === 1 ? "" : "s"}`
          : ""
      }`
    : undefined;

  const incrementNurtured = (delta: number) => {
    const next = nurturedCount + delta;
    setNurturedCount(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(NURTURED_STORAGE_KEY, String(next));
    }
  };

  const handleReviewInOrbit = () => {
    const gemsCount = batchGems.length;
    const eng = computeDigestEngagement(batchGems);
    incrementNurtured(gemsCount);
    trackFlywheelEvent("cta.digest_review_together", { gems: gemsCount });
    setCelebration({ gems: gemsCount, engagement: eng });
    setTimeout(() => {
      setCelebration(null);
      const ids = batchGems.map((b) => b.id).join(",");
      router.push(`/orbit?digestIds=${ids}&source=weekly-gems`);
    }, 400);
  };

  const handleSaveAsCollection = () => {
    if (!onSaveAsCollection) return;
    const gemsCount = batchGems.length;
    const eng = computeDigestEngagement(batchGems);
    incrementNurtured(gemsCount);
    setCelebration({ gems: gemsCount, engagement: eng });
    setTimeout(() => setCelebration(null), 3800);
    onSaveAsCollection(batchGems, "This Week’s Gems");
  };

  const handleSelectBookmark = (id: string) => {
    if (onSelectBookmark) {
      onSelectBookmark(id);
      return;
    }
    router.push(`/dashboard?bookmark=${id}`);
  };

  const handleOrbitReview = (id: string) => {
    trackFlywheelEvent("cta.review_in_orbit", {
      source: "digest",
      bookmarkId: id,
    });
    router.push(`/orbit?highlightId=${id}`);
  };

  const body = !hasGems ? (
    <div className="rounded-sm border border-dashed border-hairline-soft p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">No weekly gems yet</p>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
        Your first Orbit reviews will populate future weekly mixes. Review high-performing
        bookmarks in Orbit to train the discovery flywheel.
      </p>
      <button
        type="button"
        onClick={() => router.push("/orbit")}
        className="mt-4 rounded-sm border border-hairline-soft bg-surface-1 px-3 py-1.5 text-xs uppercase tracking-[0.06em] text-primary hover:bg-surface-2 focus-visible:outline-none"
      >
        Start reviewing in Orbit
      </button>
    </div>
  ) : (
    <div className="space-y-4">
      <DiscoveryBatchBar
        gemCount={totalMixCount}
        resurfacedCount={resurfacedGems.length}
        totalEngagement={totalEngagement}
        overlapWithQuickPicks={overlapWithQuickPicks}
        nurturedCount={nurturedCount}
        celebration={celebration}
        showExpand={totalMixCount > 6}
        expanded={expanded}
        onReviewTogether={handleReviewInOrbit}
        onSaveAsCollection={onSaveAsCollection ? handleSaveAsCollection : undefined}
        onToggleExpand={() => setExpanded(!expanded)}
        expandLabel={`See all ${totalMixCount} gems`}
      />

      {showExtrasStrip ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {displayGems.length} gem{displayGems.length === 1 ? "" : "s"} not shown in Quick picks
          </p>
          <HighlightScrollStrip
            ariaLabel="Weekly digest extras"
            itemCount={displayGems.length}
          >
            {displayGems.map((bookmark, index) => (
              <HighlightScrollSlide key={bookmark.id} index={index}>
                <HighlightCard
                  bookmark={bookmark}
                  index={index}
                  itemLabel={itemLabels[bookmark.id]}
                  onSelect={handleSelectBookmark}
                  onOrbitReview={handleOrbitReview}
                />
              </HighlightScrollSlide>
            ))}
          </HighlightScrollStrip>
        </div>
      ) : displayGems.length === 1 ? (
        <div className="max-w-xs">
          <p className="mb-2 text-xs text-muted-foreground">1 gem not shown in Quick picks</p>
          <HighlightCard
            bookmark={displayGems[0]!}
            index={0}
            itemLabel={itemLabels[displayGems[0]!.id]}
            onSelect={handleSelectBookmark}
            onOrbitReview={handleOrbitReview}
          />
        </div>
      ) : null}
    </div>
  );

  // Phase 1 embedded simplification (Weekly-Digest-Menu-Simplification-Plan.md):
  // - `body` (and DiscoveryBatchBar + Highlight* subtree) retained verbatim only for
  //   the standalone (!embedded) path + embedded !hasGems empty state.
  // - embedded + digestOpen + hasGems renders the ultra-light ritual on-ramp row only
  //   (no dense bar, no extras strip, no inner expand button). See plan for contract.
  if (embedded) {
    return (
      <div className={cn("border-t border-hairline-soft pt-4", className)}>
        <button
          type="button"
          onClick={() => setDigestOpen((v) => !v)}
          aria-expanded={digestOpen}
          className="flex w-full items-center gap-2 rounded-sm py-1 text-left transition-colors hover:bg-accent-soft/40"
        >
          {digestOpen ? (
            <ChevronDown className="size-4 shrink-0 text-primary/70" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-primary/70" />
          )}
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold text-foreground">Weekly digest</span>
          {!digestOpen && collapsedSummary ? (
            <span className="ml-1 text-xs text-muted-foreground">· {collapsedSummary}</span>
          ) : null}
        </button>
        {digestOpen ? (
          <div className="mt-3">
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
            {!hasGems ? (
              body
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">
                  {totalMixCount} gem{totalMixCount === 1 ? "" : "s"}
                  {resurfacedGems.length > 0 ? ` · ${resurfacedGems.length} resurfaced` : ""}
                  {totalEngagement > 0 ? ` · ~${totalEngagement.toLocaleString()} engagements` : ""}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleReviewInOrbit}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Review all {totalMixCount} together
                  </Button>
                  {onSaveAsCollection ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveAsCollection}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Save as collection
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={cn("mx-auto w-full max-w-[960px] px-4 pb-8 sm:px-5", className)}>
      <div className="mb-5 flex items-center gap-3">
        <div
          className={
            isOrbital
              ? cn(orbital.icon, "flex h-9 w-9 items-center justify-center rounded-sm")
              : "flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
          }
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2
            className={
              isOrbital
                ? cn(orbital.label, "text-xl font-semibold tracking-tight text-primary/90")
                : "text-xl font-semibold tracking-tight"
            }
          >
            This Week&apos;s Gems
          </h2>
          <p
            className={
              isOrbital
                ? cn(orbital.label, "mt-0.5 text-[11px] text-primary/70")
                : "mt-0.5 text-sm text-muted-foreground"
            }
          >
            A mix of untouched high-performers, resurfaced older gems, and strong library items.
          </p>
          {hasGems ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {rawTotal.toLocaleString()} untouched high-performers in pool
            </p>
          ) : null}
        </div>
      </div>
      {body}
    </section>
  );
}
