"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PerformanceHighlights } from "@/components/performance-highlights";
import {
  usePerformanceHighlights,
  type PerformanceHighlightsResponse,
} from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";
import type { BookmarkWithRelations } from "@/types";

/**
 * "This Week's Gems" / Orbit Digest (Phase 2 ritual, enhanced by 7+8)
 *
 * Recurring habit-forming recap mixing raw high-performers + library gems + resurfaced.
 * Now with frequency-weighted personalization (strong tags/authors from organized items)
 * and prominent pending signals in LibraryControlCenter.
 *
 * Goal: anticipated ritual that visibly feeds Orbit with live feedback loops.
 */
interface HighlightsDigestProps {
  className?: string;
  onSaveAsCollection?: (bookmarks: BookmarkWithRelations[], suggestedName: string) => void;
  /** When provided (e.g. from Dashboard), avoids duplicate highlight API calls. */
  rawData?: PerformanceHighlightsResponse;
  libraryData?: PerformanceHighlightsResponse;
  isLoading?: boolean;
}

export function HighlightsDigest({
  className,
  onSaveAsCollection,
  rawData: rawDataProp,
  libraryData: libraryDataProp,
  isLoading: isLoadingProp,
}: HighlightsDigestProps) {
  const router = useRouter();
  const { isOrbital } = useOrbitalTheme();
  const [expanded, setExpanded] = useState(false);

  // A: lightweight ritual persistence + celebration (lazy ls init avoids set-in-effect)
  const [nurturedCount, setNurturedCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const n = parseInt(localStorage.getItem("markmaster:digest-nurtured") || "0", 10);
    return Number.isFinite(n) ? n : 0;
  });
  const [celebration, setCelebration] = useState<null | { gems: number; engagement: number }>(null);

  const dislikedIds = getDislikedHighlightIds();
  const likedIds = getLikedHighlightIds();
  const useParentData = rawDataProp !== undefined && libraryDataProp !== undefined;
  const { data: rawFetched, isLoading: rawLoading } = usePerformanceHighlights(true, {
    dislikedIds,
    likedIds,
    enabled: !useParentData,
  });
  const { data: libraryFetched, isLoading: libraryLoading } = usePerformanceHighlights(false, {
    dislikedIds,
    likedIds,
    enabled: !useParentData,
  });
  const rawData = rawDataProp ?? rawFetched;
  const libraryData = libraryDataProp ?? libraryFetched;
  const digestLoading = isLoadingProp ?? (!useParentData && (rawLoading || libraryLoading));

  const rawGems = rawData?.bookmarks ?? [];
  const libraryGems = libraryData?.bookmarks ?? [];

  const curation = useMemo(() => {
    /* eslint-disable-next-line react-hooks/purity */
    const now = Date.now();
    const primary = rawGems.slice(0, 3);
    const libraryOnly = libraryGems.filter((g) => !rawGems.some((r) => r.id === g.id));
    const resurf = libraryOnly
      .filter((g) => {
        const ageDays = (now - new Date(g.bookmarkedAt).getTime()) / (1000 * 3600 * 24);
        return ageDays > 30;
      })
      .slice(0, 2);
    const other = libraryOnly
      .filter((g) => !resurf.some((r) => r.id === g.id))
      .slice(0, 3);
    const alls = [...primary, ...resurf, ...other];
    const disps = expanded ? alls : alls.slice(0, 6);
    return { primaryGems: primary, resurfacedGems: resurf, otherStrong: other, allGems: alls, displayGems: disps };
  }, [rawGems, libraryGems, expanded]);

  const { resurfacedGems, allGems, displayGems } = curation;

  // Build labels for the PerformanceHighlights cards
  const itemLabels: Record<string, string> = {};
  resurfacedGems.forEach((g) => {
    itemLabels[g.id] = "Resurfaced";
  });

  const rawCount = rawData?.total ?? rawGems.length;
  const hasGems = allGems.length > 0;

  // Light celebratory stats for ritual feel (hoisted before handlers to eliminate forward ref)
  const totalEngagement = allGems.reduce((sum, b) => {
    const m = b.publicMetrics;
    if (!m) return sum;
    return sum + (m.like_count || 0) + (m.reply_count || 0) + (m.bookmark_count || 0);
  }, 0);

  const incrementNurtured = (delta: number) => {
    const next = nurturedCount + delta;
    setNurturedCount(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("markmaster:digest-nurtured", String(next));
    }
  };

  const handleReviewInOrbit = () => {
    const gemsCount = allGems.length;
    const eng = totalEngagement;
    incrementNurtured(gemsCount);
    // Phase 3 Item 12 Slice 1: instrument the key "Review these together" flywheel CTA + session intent
    trackFlywheelEvent("cta.digest_review_together", { gems: gemsCount });
    setCelebration({ gems: gemsCount, engagement: eng });
    // brief visible ritual feedback before navigating into Orbit review
    setTimeout(() => {
      setCelebration(null);
      const ids = allGems.map((b) => b.id).join(",");
      router.push(`/orbit?digestIds=${ids}&source=weekly-gems`);
    }, 400);
  };

  const handleSaveAsCollection = () => {
    if (!onSaveAsCollection) return;
    const gemsCount = allGems.length;
    const eng = totalEngagement;
    incrementNurtured(gemsCount);
    setCelebration({ gems: gemsCount, engagement: eng });
    setTimeout(() => setCelebration(null), 3800);
    const suggestedName = "This Week’s Gems";
    onSaveAsCollection(allGems, suggestedName);
  };

  if (digestLoading) {
    return (
      <section
        className={cn("mx-auto w-full max-w-[960px] space-y-3 px-4 pb-8 sm:px-5", className)}
        aria-busy
        aria-label="Loading Weekly Gems"
      >
        <div className="h-9 w-48 rounded skeleton-shimmer" />
        <div className="h-32 rounded-xl border border-hairline-soft skeleton-shimmer" />
      </section>
    );
  }

  return (
    <section className={cn("mx-auto w-full max-w-[960px] px-4 pb-8 sm:px-5", className)}>
      <div className="mb-5">
        <div className="flex items-center gap-3">
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
              This Week’s Gems
            </h2>
            <p
              className={
                isOrbital
                  ? cn(orbital.label, "mt-0.5 text-[11px] text-primary/70")
                  : "text-sm text-muted-foreground"
              }
            >
              A mix of untouched high-performers, resurfaced older gems, and strong library items. Perfect time to review or save them.
            </p>
          </div>
        </div>

        {hasGems && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div
              className={
                isOrbital
                  ? cn(orbital.glass, "rounded-sm border border-primary/15 px-3 py-1 text-primary/80")
                  : "rounded-full bg-muted px-3 py-1"
              }
            >
              {rawCount} untouched high-performers
            </div>
            <div
              className={
                isOrbital
                  ? cn(orbital.glass, "rounded-sm border border-primary/15 px-3 py-1 text-primary/80")
                  : "rounded-full bg-muted px-3 py-1"
              }
            >
              {allGems.length} total gems
            </div>
            {totalEngagement > 0 && (
              <div
                className={
                  isOrbital
                    ? cn(orbital.glass, "rounded-sm border border-primary/20 px-3 py-1 text-primary")
                    : "rounded-full bg-primary/10 px-3 py-1 text-primary"
                }
              >
                ~{totalEngagement.toLocaleString()} total engagements on X
              </div>
            )}
            {resurfacedGems.length > 0 && (
              <div
                className={
                  isOrbital
                    ? cn(orbital.badge("bronze"), "rounded-sm px-2.5 py-1 text-[10px]")
                    : "rounded-full bg-amber-400/10 px-3 py-1 text-amber-300"
                }
              >
                {resurfacedGems.length} resurfaced
              </div>
            )}
            {nurturedCount > 0 && (
              <div
                className={
                  isOrbital
                    ? cn(orbital.glass, "rounded-sm border border-primary/15 px-3 py-1 text-primary/80")
                    : "rounded-full bg-muted px-3 py-1"
                }
              >
                {nurturedCount} gems nurtured
              </div>
            )}
          </div>
        )}
      </div>

      {celebration && (
        <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-emerald-200">
            <Sparkles className="h-4 w-4" />
            <span>
              Ritual reinforced — nurtured <span className="font-medium tabular-nums">{celebration.gems}</span> gems
              {celebration.engagement > 0 && (
                <> • ~<span className="font-medium tabular-nums">{celebration.engagement.toLocaleString()}</span> engagement impact</>
              )}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-300/70">Thank you — this powers better future Weekly Gems.</div>
        </div>
      )}

      {!hasGems ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No Weekly Gems yet</p>
          <p className="mt-2 max-w-md mx-auto text-xs text-muted-foreground">
            Your first Orbit reviews will populate future Weekly Gems rituals. Review high-performing bookmarks in Orbit to train the discovery flywheel.
          </p>
          <button
            type="button"
            onClick={() => router.push("/orbit")}
            className="mt-4 rounded-md border border-hairline-soft bg-surface-1 px-3 py-1.5 text-xs uppercase tracking-[0.06em] text-primary hover:bg-surface-2 focus-visible:outline-none"
          >
            Start reviewing in Orbit
          </button>
          <p className="mt-3 text-[10px] text-muted-foreground/60">Each review helps surface forgotten or high-potential gems here over time.</p>
        </div>
      ) : (
        <>
          <PerformanceHighlights
            title=""
            subtitle=""
            bookmarks={displayGems}
            total={allGems.length}
            onSelect={(id) => router.push(`/dashboard?bookmark=${id}`)}
            onOrbitReview={(id) => {
              // Phase 3 Item 12: individual "Review in Orbit" from Digest gems
              trackFlywheelEvent("cta.review_in_orbit", { source: "digest", bookmarkId: id });
              router.push(`/orbit?highlightId=${id}`);
            }}
            isRawMode={false}
            itemLabels={itemLabels}
          />

          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReviewInOrbit}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Review these together
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

            {allGems.length > 6 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="text-xs"
              >
                {expanded ? "Show fewer" : `See all ${allGems.length} gems`}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
