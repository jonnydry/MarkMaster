"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { OrbitReviewEditSheet } from "@/components/orbit/orbit-review-edit-sheet";
import type {
  AuthorDecisionHistory,
  AuthorDecisionHistoryData,
} from "@/lib/orbit-author-history";
import type {
  SimilarCollections,
  SimilarCollectionsData,
} from "@/lib/orbit-similar-collections";
import {
  OrbitReviewTagField,
  OrbitReviewCollectionField,
  OrbitReviewDecisionControl,
  getDecisionLabel,
} from "@/components/orbit/orbit-review-fields";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  buildReviewedOrbitPlan,
  createOrbitReviewDraft,
  createOrbitReviewDraftFromSuggestion,
  deriveReviewDecision,
  getQuickSmartPatch,
  orbitReviewDecisionUsesCollection,
  orbitReviewDecisionUsesTags,
  splitTagNames,
  type OrbitReviewDecision,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import { confidenceLabel, formatConfidence } from "@/lib/orbit-decision";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/fetch-json";

import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";
import { reviewChrome } from "@/lib/orbit-review-chrome";
import { addLikedHighlightId, getHighlightFeedback } from "@/lib/highlight-feedback";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { toast } from "sonner";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitApplyResult,
  OrbitBookmarkSuggestion,
  OrbitScanPlan,
  OrbitScanResponsePayload,
  TagWithCount,
} from "@/types";

interface OrbitReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: OrbitScanResponsePayload | null;
  bookmarks: BookmarkWithRelations[];
  dismissedBookmarkIds: Set<string>;
  existingTags: TagWithCount[];
  existingCollections: CollectionWithCount[];
  applying: boolean;
  focusBookmarkId: string | null;
  reviewSessionId: number;
  onApply: (
    reviewedPlan: OrbitScanPlan,
    opts: { createCollections: boolean; keptBookmarkIds: string[] }
  ) => Promise<OrbitApplyResult | null>;

  // Phase 2: When the user clicked "Review all" from a Highlights Digest
  digestBookmarkIds?: string[] | null;

  // Phase 2: User feedback from the queue (good / not_relevant)
  feedbackById?: Record<string, 'good' | 'not_relevant'>;
}

function getPreviewText(
  bookmark: BookmarkWithRelations | null,
  fallbackReasoning?: string
): string {
  if (bookmark) return bookmark.tweetText.replace(/\s+/g, " ").trim();
  if (fallbackReasoning) return fallbackReasoning.replace(/\s+/g, " ").trim();
  return "Bookmark preview unavailable.";
}

export function OrbitReviewDialog({
  open,
  onOpenChange,
  plan,
  bookmarks,
  dismissedBookmarkIds,
  existingTags,
  existingCollections,
  applying,
  focusBookmarkId,
  reviewSessionId,
  onApply,
  digestBookmarkIds,
  feedbackById = {},
}: OrbitReviewDialogProps) {
  const { isOrbital } = useOrbitalTheme();
  const [draftState, setDraftState] = useState<{
    key: string;
    drafts: OrbitReviewSuggestionDraft[];
  }>(() => ({ key: "empty", drafts: [] }));
  const [createCollectionsState, setCreateCollectionsState] = useState<{
    key: string;
    value: boolean;
  }>(() => ({ key: "empty", value: true }));

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [sheetBookmarkId, setSheetBookmarkId] = useState<string | null>(null);
  const [, setFeedbackTick] = useState(0); // for refreshing per-draft history IIFEs after batch Mark Good

  // reviewMode uses the same keyed-state pattern as draftState / createCollectionsState
  // (keyed by reviewSessionId). This guarantees:
  // - Fresh "deep" default for every new review session (when parent bumps reviewSessionId
  //   before opening the dialog, or on first mount).
  // - Toggled value persists for the duration of the current reviewSessionId (while dialog open).
  // - No setState-in-effect needed; derivation handles reset automatically.
  // Slice 2: within-session memory means once user picks Quick Pass, all subsequent
  // card previews + Details sheets in this review respect quick visuals/defaults (no retoggle).
  // (assuming parent bumped reviewSessionId on open, as the primary handlers do)
  // Matches "default to 'deep' to preserve current behavior" + reset on new session/close+reopen.
  const [reviewModeState, setReviewModeState] = useState<{
    key: string;
    mode: "quick" | "deep";
  }>(() => ({ key: "empty", mode: "deep" }));

  const reviewMode: "quick" | "deep" =
    reviewModeState.key === String(reviewSessionId) ? reviewModeState.mode : "deep";
  const isQuick = reviewMode === "quick";

  // For reading cached Item 9 author/similar data (populated only on-demand by the sheet queries).
  // Enables getQuickSmartPatch to return history-aware patches in list cards *without any new API calls*.
  // If an author/bookmark was never opened in Details during this session, cache miss -> pure original fallback.
  const queryClient = useQueryClient();

  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );

  const sourcePlan = useMemo<OrbitScanPlan | null>(() => {
    if (!plan) return null;

    const suggestions = plan.plan.suggestions.filter((suggestion) => {
      if (dismissedBookmarkIds.has(suggestion.bookmarkId)) return false;
      if (focusBookmarkId) return suggestion.bookmarkId === focusBookmarkId;
      return true;
    });

    return {
      overview: plan.plan.overview,
      suggestions,
    };
  }, [dismissedBookmarkIds, focusBookmarkId, plan]);

  const draftKey = useMemo(() => {
    if (!sourcePlan) return "empty";

    return [
      reviewSessionId,
      focusBookmarkId ?? "all",
      sourcePlan.suggestions.map((suggestion) => suggestion.bookmarkId).join("|"),
    ].join(":");
  }, [focusBookmarkId, reviewSessionId, sourcePlan]);

  const drafts = useMemo(() => {
    if (!sourcePlan) return [];
    if (draftState.key === draftKey) return draftState.drafts;
    return createOrbitReviewDraft(sourcePlan);
  }, [draftKey, draftState, sourcePlan]);

  // Phase 2: Filter for Digest mode + user feedback
  const effectiveDrafts = useMemo(() => {
    let result = drafts;

    // 1. Filter to only the gems from the current Digest (if any)
    if (digestBookmarkIds && digestBookmarkIds.length > 0) {
      const digestSet = new Set(digestBookmarkIds);
      result = result.filter((d) => digestSet.has(d.bookmarkId));
    }

    // 2. Respect inline feedback from the queue (hide "not relevant")
    result = result.filter((d) => feedbackById[d.bookmarkId] !== 'not_relevant');

    return result;
  }, [drafts, digestBookmarkIds, feedbackById]);

  const createCollections =
    createCollectionsState.key === draftKey ? createCollectionsState.value : true;

  const reviewedPlan = useMemo(() => {
    if (!sourcePlan) return null;

    return buildReviewedOrbitPlan({
      sourcePlan,
      drafts: effectiveDrafts,   // only the filtered gems when in digest mode
      existingTags,
      existingCollections,
    });
  }, [effectiveDrafts, existingCollections, existingTags, sourcePlan]);

  const reviewStats = useMemo(() => {
    const keptBookmarks = effectiveDrafts.filter((draft) => draft.decision === "keep")
      .length;
    const tagAssignments =
      reviewedPlan?.suggestions.reduce(
        (total, suggestion) => total + suggestion.tags.length,
        0
      ) ?? 0;
    const collectionMoves =
      reviewedPlan?.suggestions.filter((suggestion) => suggestion.collection)
        .length ?? 0;

    return {
      applyableBookmarks: effectiveDrafts.length, // only count what the user is actually reviewing right now
      keptBookmarks,
      tagAssignments,
      collectionMoves,
    };
  }, [effectiveDrafts, reviewedPlan]);

  const keptBookmarkIds = useMemo(
    () =>
      effectiveDrafts
        .filter((draft) => draft.decision === "keep")
        .map((draft) => draft.bookmarkId),
    [effectiveDrafts]
  );

  const updateDraft = useCallback(
    (bookmarkId: string, patch: Partial<OrbitReviewSuggestionDraft>) => {
      // Phase 3 Item 12 Slice 3: lightweight outcome instrumentation for Quick Pass keep decisions.
      // Fires only on explicit keep while Quick Pass active (follows all existing trackFlywheelEvent patterns).
      // Zero UI, zero perf, zero user-visible impact — pure measurement for the elegant keep-rate signal.
      if (patch.decision === "keep" && isQuick) {
        trackFlywheelEvent("quick.keep", { via: "decision" });
      }
      setDraftState((prev) => {
        const activeDrafts =
          prev.key === draftKey && prev.drafts.length > 0
            ? prev.drafts
            : drafts;
        return {
          key: draftKey,
          drafts: activeDrafts.map((draft) =>
            draft.bookmarkId === bookmarkId ? { ...draft, ...patch } : draft
          ),
        };
      });
    },
    [draftKey, drafts, isQuick]
  );

  const handleCreateCollectionsChange = useCallback(
    (value: boolean) => {
      setCreateCollectionsState({ key: draftKey, value });
    },
    [draftKey]
  );

  const handleApply = useCallback(async () => {
    if (
      !reviewedPlan ||
      (reviewedPlan.suggestions.length === 0 && keptBookmarkIds.length === 0)
    ) {
      return;
    }
    const applied = await onApply(reviewedPlan, {
      createCollections,
      keptBookmarkIds,
    });
    if (applied) {
      onOpenChange(false);
    }
  }, [createCollections, keptBookmarkIds, onApply, onOpenChange, reviewedPlan]);

  const title = focusBookmarkId ? "Review bookmark move" : "Review Orbit pass";
  const canApply = Boolean(
    reviewedPlan &&
      (reviewedPlan.suggestions.length > 0 || keptBookmarkIds.length > 0)
  );

  // Supporting state derived for the refined native review UI (impact bar + per-card diffing)
  const originalSuggestionById = useMemo(() => {
    if (!sourcePlan) return new Map<string, OrbitBookmarkSuggestion>();
    return new Map(
      sourcePlan.suggestions.map((s) => [s.bookmarkId, s] as const)
    );
  }, [sourcePlan]);

  const impact = useMemo(() => {
    let addedTagCount = 0;
    let addedCollectionCount = 0;
    effectiveDrafts.forEach((draft) => {
      const original = originalSuggestionById.get(draft.bookmarkId);
      if (!original) return;
      const origTagNames = original.tags.map((t) => t.name);
      const currTagNames = splitTagNames(draft.tagNames);
      currTagNames.forEach((t) => {
        if (!origTagNames.includes(t)) addedTagCount += 1;
      });
      const hadCol = Boolean(original.collection);
      const hasCol = Boolean(draft.collectionName.trim());
      if (hasCol && !hadCol) addedCollectionCount += 1;
    });
    return { addedTagCount, addedCollectionCount };
  }, [effectiveDrafts, originalSuggestionById]);

  // Real historical author decision context (Phase 3 Item 9 Slice 2, Approach A).
  // Dedicated lightweight query (via useQuery + API) fired when the edit sheet
  // opens for a bookmark. Delivers highest-quality library signals (real tags +
  // user collections from prior bookmarks by same author, ordered by freq+recency
  // in the DB aggregation). Loading state handled for graceful UX. No heavy
  // pre-caching; natural react-query staleTime provides light reuse.
  const sheetAuthor = useMemo(() => {
    if (!sheetBookmarkId) return null;
    return bookmarkById.get(sheetBookmarkId)?.authorUsername ?? null;
  }, [sheetBookmarkId, bookmarkById]);

  const normalizedSheetAuthor = sheetAuthor?.trim().toLowerCase() ?? null;

  const { data, isLoading, isFetching, isError: authorHistoryError } = useQuery<AuthorDecisionHistoryData>({
    queryKey: ["orbit", "author-history", normalizedSheetAuthor],
    queryFn: async () => {
      if (!sheetAuthor) return null;
      const normalized = sheetAuthor.trim().toLowerCase();
      return fetchJson<AuthorDecisionHistoryData>(
        `/api/orbit/author-history?authorUsername=${encodeURIComponent(normalized)}`
      );
    },
    enabled: isEditSheetOpen && !!normalizedSheetAuthor,
    staleTime: 5 * 60 * 1000, // 5 min — light natural reuse across quick re-opens
    gcTime: 10 * 60 * 1000,
  });

  const authorHistoryForSheet = useMemo<AuthorDecisionHistory>(() => {
    if (!sheetAuthor) return null;
    if (authorHistoryError) return null;
    if (isLoading || isFetching) {
      return { authorUsername: sheetAuthor, loading: true };
    }
    return data ?? null;
  }, [sheetAuthor, authorHistoryError, data, isLoading, isFetching]);

  // Similar high-performers context (Phase 3 Item 9 Slice 3, Approach A).
  // Dedicated lightweight query (via useQuery + API) fired when the edit sheet
  // opens for a bookmark. Delivers real high-signal overlaps on the current
  // bookmark's collections (primary) + tags (secondary), weighted by the
  // established performance score + overlap strength. Small limit for quality.
  // Loading state handled for graceful UX. Reuses exact same on-demand + staleTime
  // pattern as author history (no pre-compute, no scan changes).
  const {
    data: similarData,
    isLoading: similarLoading,
    isFetching: similarFetching,
    isError: similarCollectionsError,
  } = useQuery<SimilarCollectionsData>({
      queryKey: ["orbit", "similar-collections", sheetBookmarkId],
      queryFn: async () => {
        if (!sheetBookmarkId) return null;
        return fetchJson<SimilarCollectionsData>(
          `/api/orbit/similar-collections?bookmarkId=${encodeURIComponent(sheetBookmarkId)}`
        );
      },
      enabled: isEditSheetOpen && !!sheetBookmarkId,
      staleTime: 5 * 60 * 1000, // 5 min — light natural reuse across quick re-opens
      gcTime: 10 * 60 * 1000,
    });

  const similarCollectionsForSheet = useMemo<SimilarCollections>(() => {
    if (!sheetBookmarkId) return null;
    if (similarCollectionsError) return null;
    if (similarLoading || similarFetching) {
      return { loading: true };
    }
    return similarData ?? null;
  }, [sheetBookmarkId, similarCollectionsError, similarData, similarLoading, similarFetching]);

  // Keyboard shortcut for Quick Pass / Deep Review toggle (Q). Scoped to when the
  // dialog is open (prevents silent mutations while viewing orbit map/list outside the review).
  // Also guards BUTTON (decision controls etc.) + INPUT/TEXTAREA/contentEditable.
  // Uses reviewSessionId for the keyed setter so Q inside an open dialog respects the
  // current session (reset happens on new reviewSessionId).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "BUTTON" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        setReviewModeState((prev) => {
          const currMode =
            prev.key === String(reviewSessionId) ? prev.mode : "deep";
          const next = currMode === "quick" ? "deep" : "quick";
          // Phase 3 Item 12: track Quick Pass / Deep Review keyboard toggle for adoption signal
          trackFlywheelEvent(next === "quick" ? "mode.quick" : "mode.deep", { via: "keyboard" });
          return {
            key: String(reviewSessionId),
            mode: next,
          };
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, reviewSessionId]);

  const handleBulkApplySuggested = useCallback(() => {
    if (!sourcePlan) return;
    const fresh = createOrbitReviewDraft(sourcePlan);
    setDraftState({ key: draftKey, drafts: fresh });
  }, [draftKey, sourcePlan]);

  const handleBulkKeepAll = useCallback(() => {
    drafts.forEach((d) =>
      updateDraft(d.bookmarkId, { decision: "keep", included: false })
    );
  }, [drafts, updateDraft]);

  const handleBulkTagOnly = useCallback(() => {
    setDraftState((prev) => {
      const activeDrafts =
        prev.key === draftKey && prev.drafts.length > 0
          ? prev.drafts
          : drafts;
      return {
        key: draftKey,
        drafts: activeDrafts.map((d) => ({
          ...d,
          decision: "tags" as OrbitReviewDecision,
          included: true,
        })),
      };
    });
  }, [draftKey, drafts]);

  const handleResetOne = useCallback(
    (bookmarkId: string) => {
      const orig = originalSuggestionById.get(bookmarkId);
      if (!orig) return;
      const fresh = createOrbitReviewDraftFromSuggestion(orig);
      updateDraft(bookmarkId, {
        decision: fresh.decision,
        included: fresh.included,
        tagNames: fresh.tagNames,
        collectionName: fresh.collectionName,
        collectionDescription: fresh.collectionDescription,
      });
    },
    [originalSuggestionById, updateDraft]
  );

  // Slice 3: explicit one-click handler for the prominent Quick Pass "Accept Orbit suggestion" button.
  // Computes smart patch at click time by reading react-query cache (populated by the existing
  // on-demand sheet queries for author-history / similar-collections). Zero additional network.
  // - With no cache hit: falls back to original Grok suggestion (pure "Accept Orbit").
  // - With cache hit (user opened Details for author/item before): applies conservative
  //   history/similar-derived patch (e.g. preferred tags/collections from past decisions).
  // Patch applied exactly like manual edits or Reset; downstream reviewedPlan / Apply unchanged.
  // Smart is *never* auto-applied on render or draft creation — only on this explicit click.
  const handleAcceptOrbitSuggestion = useCallback(
    (bookmarkId: string) => {
      const orig = originalSuggestionById.get(bookmarkId);
      if (!orig) return;

      // Read caches at click time (safe, never triggers fetch; undefined => treat as no signal)
      const bm = bookmarkById.get(bookmarkId);
      const auth = bm?.authorUsername?.trim().toLowerCase() ?? null;

      let h: AuthorDecisionHistory | null = null;
      if (auth) {
        const cached = queryClient.getQueryData<AuthorDecisionHistoryData>([
          "orbit",
          "author-history",
          auth,
        ]);
        if (cached !== undefined) {
          h = cached; // Data | null (non-loading)
        }
      }

      const cachedSim = queryClient.getQueryData<SimilarCollectionsData>([
        "orbit",
        "similar-collections",
        bookmarkId,
      ]);
      const s: SimilarCollections | null =
        cachedSim !== undefined ? cachedSim : null;

      const patch = getQuickSmartPatch(orig, h, s);
      const baseFromOrig = createOrbitReviewDraftFromSuggestion(orig);
      const finalPatch = patch ?? baseFromOrig;

      updateDraft(bookmarkId, {
        decision: finalPatch.decision,
        included: finalPatch.decision !== "keep",
        tagNames: finalPatch.tagNames ?? "",
        collectionName: finalPatch.collectionName ?? "",
        collectionDescription: finalPatch.collectionDescription ?? "",
      });
    },
    [
      bookmarkById,
      originalSuggestionById,
      queryClient,
      updateDraft,
    ]
  );

  const rcx = reviewChrome(isOrbital);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={rcx.dialogShell}>
        <DialogHeader className={cn("border-b px-5 py-4", rcx.headerBorder)}>
          {digestBookmarkIds && digestBookmarkIds.length > 0 && (
            <div className={cn("mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm", orbital.badge("cyan"))}>
              <Sparkles className="h-4 w-4" />
              <span>
                Reviewing your Weekly Gems from Highlights ({digestBookmarkIds.length} items)
              </span>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl", orbital.icon)}>
              <GrokMark className="size-4" title="Grok" />
            </span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription className={cn("mt-1", rcx.muted)}>
                  Choose what to do with each suggestion, then adjust the tags and
                  destinations that will be applied.
                </DialogDescription>
              </div>

              {/* Quick Pass / Deep Review mode toggle + keyboard hint (Phase 3 Item 10 Slice 1).
                   Title+desc flex keeps toggle right-aligned without overlap (handles long titles + digest banner). */}
              <div className="shrink-0 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "inline-flex items-center p-0.5 text-[10px]",
                      rcx.toggleShell,
                      isQuick && (isOrbital ? "border-primary/30" : "border-primary/30")
                    )}
                    role="group"
                    aria-label="Review mode"
                  >
                    <button
                      type="button"
                      aria-pressed={isQuick}
                      onClick={() => {
                        // Phase 3 Item 12: track explicit Quick Pass toggle (adoption + dominance signal)
                        trackFlywheelEvent("mode.quick", { via: "click" });
                        setReviewModeState({ key: String(reviewSessionId), mode: "quick" });
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-0.5 font-medium transition-colors",
                        isQuick ? rcx.toggleActive : rcx.toggleIdle
                      )}
                      title="Quick Pass: light path from standouts into Orbit (press Q)"
                    >
                      Quick Pass ⚡
                    </button>
                    <button
                      type="button"
                      aria-pressed={!isQuick}
                      onClick={() => {
                        // Phase 3 Item 12: track explicit Deep Review toggle
                        trackFlywheelEvent("mode.deep", { via: "click" });
                        setReviewModeState({ key: String(reviewSessionId), mode: "deep" });
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-0.5 font-medium transition-colors",
                        !isQuick ? rcx.toggleActive : rcx.toggleIdle
                      )}
                      title="Deep Review: full reasoning with context panels (press Q)"
                    >
                      Deep Review
                    </button>
                  </div>
                  <kbd
                    className={cn(orbital.data, "rounded border border-hairline-soft bg-surface-2/80 px-1 py-px text-[9px] text-primary/50")}
                    aria-hidden="true"
                    title="Keyboard shortcut"
                  >
                    Q
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Refined Native-First Orbit Review — vertical list of native-style cards + Impact Bar */}
        <div className="min-h-0 overflow-hidden px-4 py-3">
          {/* Global Impact Bar (styled like rail metrics) */}
          {effectiveDrafts.length > 0 && (
            <div className={cn("mb-3 p-3", rcx.panel)}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={cn("flex items-center gap-4 text-[11px]", rcx.data)}>
                  <div><span className={rcx.soft}>Apply</span> <span className="font-medium tabular-nums">{reviewStats.applyableBookmarks}</span></div>
                  <div><span className={rcx.soft}>Keep</span> <span className="font-medium tabular-nums">{reviewStats.keptBookmarks}</span></div>
                  <div><span className="text-primary/80">+{impact.addedTagCount} tags</span></div>
                  <div><span className="text-bronze/80">+{impact.addedCollectionCount} cols</span></div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Optimized batch actions (incl. "Mark remaining as Good") when reviewing a curated set from Highlights (Phase 2 + B polish) */}
                  {digestBookmarkIds && digestBookmarkIds.length > 0 ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={handleBulkKeepAll}
                        disabled={applying}
                      >
                        Keep remaining
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs bg-white text-slate-950 hover:bg-white/90"
                        onClick={() => {
                          // Accept all currently suggested decisions for the digest set
                          effectiveDrafts.forEach((draft) => {
                            if (draft.decision !== "keep") {
                              updateDraft(draft.bookmarkId, { decision: draft.decision });
                            }
                          });
                        }}
                        disabled={applying}
                      >
                        Accept strong suggestions
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => {
                          let marked = 0;
                          effectiveDrafts.forEach((draft) => {
                            const id = draft.bookmarkId;
                            if (getHighlightFeedback(id) !== "not_relevant") {
                              addLikedHighlightId(id);
                              marked++;
                            }
                          });
                          if (marked > 0) {
                            toast.success(`Marked ${marked} as Good — boosts future Highlights`);
                          }
                          setFeedbackTick((t) => t + 1);
                        }}
                        disabled={applying}
                      >
                        Mark remaining as Good
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleBulkApplySuggested} disabled={applying}>
                        <RotateCcw className="mr-1 size-3" /> Restore all
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkKeepAll} disabled={applying}>
                        Keep all
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkTagOnly} disabled={applying}>
                        Tag all
                      </Button>
                    </>
                  )}

                  <div className={cn("ml-2 flex items-center gap-2 border-l pl-3", rcx.headerBorder)}>
                    <span className={cn("text-xs", rcx.muted)}>New collections</span>
                    <Switch checked={createCollections} onCheckedChange={handleCreateCollectionsChange} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <ScrollArea className="h-[58vh]">
            <div className={cn("space-y-3 pb-6", isQuick && "space-y-2 pb-4")}>
              {effectiveDrafts.length === 0 && (
                <div className={cn("p-6 text-center text-sm", rcx.panel, rcx.soft)}>
                  {!sourcePlan
                    ? "Grok is preparing suggestions for this review…"
                    : "No suggestions are waiting for review."}
                </div>
              )}

              {effectiveDrafts.map((draft) => {
                const bookmark = bookmarkById.get(draft.bookmarkId) ?? null;
                const original = originalSuggestionById.get(draft.bookmarkId) ?? null;
                const preview = getPreviewText(bookmark, original?.reasoning);

                const origDecision = original
                  ? deriveReviewDecision(original)
                  : null;
                const origDecisionLabel = origDecision
                  ? getDecisionLabel(origDecision)
                  : "—";

                const currDecisionLabel = getDecisionLabel(draft.decision);

                const origTagNames = original ? original.tags.map((t) => t.name) : [];
                const currTagNames = splitTagNames(draft.tagNames);

                const origTagSet = new Set(origTagNames);
                const currTagSet = new Set(currTagNames);

                const addedTags = currTagNames.filter((t) => !origTagSet.has(t));
                const removedTags = origTagNames.filter((t) => !currTagSet.has(t));

                const origCol = original?.collection?.name || null;
                const currCol = draft.collectionName.trim() || null;

                const origDecisionForHas = original
                  ? deriveReviewDecision(original)
                  : "keep";
                const tagsChanged =
                  origTagSet.size !== currTagSet.size ||
                  [...origTagSet].some((t) => !currTagSet.has(t));
                const hasChanges =
                  draft.decision !== origDecisionForHas ||
                  tagsChanged ||
                  draft.collectionName !== (origCol || "");

                return (
                  <div
                    key={draft.bookmarkId}
                    className={cn(
                      orbital.glass,
                      "group relative border border-hairline-soft shadow-sm transition-all",
                      isQuick && "rounded-xl shadow-none border-white/5",
                      draft.decision === "keep" && "opacity-75",
                      sheetBookmarkId === draft.bookmarkId && "border-primary/50 bg-surface-2/70",
                      "hover:border-white/20 hover:bg-surface-2/50"
                    )}
                  >
                    {/* Header — native to triage card + focus strip */}
                    <div className={cn(
                      "flex items-center justify-between px-4 pt-3 pb-1.5",
                      isQuick && "px-3 pt-2 pb-1"
                    )}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("truncate text-sm font-medium", rcx.body)}>
                          @{bookmark?.authorUsername || draft.bookmarkId}
                        </span>
                        {original && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                              original.confidence === "high" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                              original.confidence === "medium" && "border-primary/30 bg-primary/10 text-primary/80",
                              original.confidence === "low" && "border-blue-500/30 bg-blue-500/10 text-blue-200"
                            )}
                            title={formatConfidence(original.confidence)}
                          >
                            {confidenceLabel(original.confidence).split(" ")[0]}
                          </span>
                        )}
                      </div>

                      {hasChanges && (
                        <span className="rounded bg-amber-400/15 px-1.5 py-px text-[10px] text-amber-300">edited</span>
                      )}
                    </div>

                    {/* Preview */}
                    <div className={cn(
                      cn("px-4 pb-2 text-[13px] leading-snug line-clamp-2", rcx.bodyDim),
                      isQuick && cn("px-3 pb-1 text-[12px] leading-snug line-clamp-1", rcx.muted)
                    )}>
                      {preview}
                    </div>

                    {bookmark?.media && bookmark.media.length > 0 ? (
                      <div className={cn("px-4 pb-2", isQuick && "px-3")}>
                        <BookmarkPostPreview
                          mediaOnly
                          tweetText=""
                          authorUsername={bookmark.authorUsername}
                          media={bookmark.media}
                          tweetLink={{
                            authorUsername: bookmark.authorUsername,
                            tweetId: bookmark.tweetId,
                          }}
                          bookmarkKey={bookmark.id}
                          variant="inline"
                          galleryClassName="!mt-0 max-h-40"
                        />
                      </div>
                    ) : null}

                    {/* B: surface prior feedback history for digest gems (closed loop) */}
                    {(() => {
                      const prior = getHighlightFeedback(draft.bookmarkId) || feedbackById[draft.bookmarkId];
                      if (prior) {
                        const label = prior === "good" ? "You marked this Great" : "You marked Not relevant";
                        return (
                          <div className={cn("px-4 pb-1 text-[10px] text-emerald-300/80", isQuick && "px-3")}>
                            {label}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Grok reasoning — native meta label (de-emphasized/hidden in Quick Pass for density) */}
                    {original?.reasoning && !isQuick && (
                      <div className={cn("px-4 pb-2 text-xs leading-snug", rcx.muted)}>
                        {original.reasoning}
                      </div>
                    )}

                    {/* Compact change summary — elegant native treatment */}
                    {hasChanges && (
                      <div className={cn("px-4 pb-2 flex flex-wrap items-center gap-1.5 text-[10px]", isQuick && "px-3")}>
                        {currDecisionLabel !== origDecisionLabel && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-px text-amber-300">
                            Decision changed
                          </span>
                        )}
                        {addedTags.length > 0 && (
                          <span className="rounded bg-emerald-400/15 px-1.5 py-px text-emerald-300">
                            +{addedTags.length} tags
                          </span>
                        )}
                        {removedTags.length > 0 && (
                          <span className="rounded bg-rose-400/15 px-1.5 py-px text-rose-300">
                            −{removedTags.length} tags
                          </span>
                        )}
                        {origCol !== currCol && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-px text-amber-300">
                            Collection changed
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action footer — exact triage card treatment for native cohesion */}
                    <div className={cn(
                      "relative flex flex-col gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(10,15,29,0.85))] px-4 py-3 rounded-b-2xl",
                      isQuick && "gap-2 px-3 py-2 rounded-b-xl"
                    )}>
                      <div className="flex items-center gap-2">
                        {/* Slice 3 Quick Pass: prominent primary one-click action.
                            "Accept Orbit suggestion" is the fast path — applies conservative smart patch
                            (Grok original, or history/similar-steered values if context cached from Details).
                            Only fires on explicit click (no auto on render). Most visually lifted control
                            in quick cards. Decision control remains for quick manual tweaks; Details for full
                            override + to load richer signals for future smart patches on this author. */}
                        {isQuick && (
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200 hover:bg-emerald-500/20"
                            onClick={() => handleAcceptOrbitSuggestion(draft.bookmarkId)}
                            disabled={applying}
                            title="One-click accept of Orbit suggestion (uses your author history + similar high-performers for smart defaults when you have opened Details for this item). Stays in Quick Pass fast path."
                          >
                            <Sparkles className="size-3" />
                            Accept Orbit suggestion
                          </Button>
                        )}

                        <div className={cn(
                          "rounded-md border border-white/10 bg-black/20 p-px",
                          isQuick && "ring-1 ring-white/25 bg-black/30"
                        )}>
                          <OrbitReviewDecisionControl
                            value={draft.decision}
                            onChange={(decision) => updateDraft(draft.bookmarkId, { decision, included: decision !== "keep" })}
                          />
                        </div>

                        <div className="ml-auto flex items-center gap-1.5">
                          {hasChanges && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn("h-7 gap-1 text-[10px]", rcx.muted, "hover:text-foreground")}
                              onClick={() => handleResetOne(draft.bookmarkId)}
                              disabled={applying}
                            >
                              <RotateCcw className="size-3" /> Reset
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              cn("h-7 gap-1 text-[10px]", rcx.ghostBtn),
                              sheetBookmarkId === draft.bookmarkId && "border-primary/60 bg-primary/10 text-primary/80"
                            )}
                            onClick={() => {
                              setSheetBookmarkId(draft.bookmarkId);
                              setIsEditSheetOpen(true);
                            }}
                          >
                            Details
                          </Button>
                        </div>
                      </div>

                      {/* Inline editors — refined native treatment inside the action footer */}
                      {draft.decision !== "keep" && (
                        <div className="flex flex-col gap-4 pt-2 md:flex-row md:gap-4">
                          {orbitReviewDecisionUsesTags(draft.decision) && (
                            <div className="flex-1 rounded-lg bg-white/[0.02] p-2.5">
                              <div className={cn(rcx.label, "mb-1.5")}>
                                Tags
                              </div>
                              <OrbitReviewTagField
                                tagNames={draft.tagNames}
                                included={true}
                                existingTags={existingTags}
                                onTagNamesChange={(n) => updateDraft(draft.bookmarkId, { tagNames: n })}
                              />
                            </div>
                          )}
                          {orbitReviewDecisionUsesCollection(draft.decision) && (
                            <div className="flex-1 rounded-lg bg-white/[0.02] p-2.5">
                              <div className={cn(rcx.label, "mb-1.5")}>
                                Collection
                              </div>
                              <OrbitReviewCollectionField
                                collectionName={draft.collectionName}
                                collectionDescription={draft.collectionDescription}
                                included={true}
                                namePlaceholder="No collection move"
                                existingCollections={existingCollections}
                                onCollectionNameChange={(n) => updateDraft(draft.bookmarkId, { collectionName: n })}
                                onCollectionDescriptionChange={(d) => updateDraft(draft.bookmarkId, { collectionDescription: d })}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right-side rich editing sheet */}
        <OrbitReviewEditSheet
          open={isEditSheetOpen}
          onOpenChange={(nextOpen) => {
            setIsEditSheetOpen(nextOpen);
            if (!nextOpen) setSheetBookmarkId(null);
          }}
          draft={drafts.find((d) => d.bookmarkId === sheetBookmarkId) ?? null}
          original={sheetBookmarkId ? originalSuggestionById.get(sheetBookmarkId) ?? null : null}
          bookmark={sheetBookmarkId ? bookmarkById.get(sheetBookmarkId) ?? null : null}
          existingTags={existingTags}
          existingCollections={existingCollections}
          onDraftChange={(id, patch) => updateDraft(id, patch)}
          onReset={(id) => handleResetOne(id)}
          authorHistory={authorHistoryForSheet}
          similarCollections={similarCollectionsForSheet}
          reviewMode={reviewMode}
          reviewSessionId={reviewSessionId}
        />

        <DialogFooter className={cn("px-5 py-4", rcx.footerBar)}>
          <Button
            variant="outline"
            className={rcx.ghostBtn}
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            className={cn(
              "gap-1.5",
              isOrbital
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-white text-slate-950 hover:bg-white/90"
            )}
            onClick={handleApply}
            disabled={!canApply || applying}
          >
            {applying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Apply decisions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

