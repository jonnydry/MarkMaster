"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderInput,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { OrbitReviewEditSheet } from "@/components/orbit/orbit-review-edit-sheet";
import {
  OrbitReviewCollectionField,
  OrbitReviewDecisionControl,
  OrbitReviewTagField,
  getDecisionLabel,
} from "@/components/orbit/orbit-review-fields";
import { useOrbitalTheme } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { fetchJson } from "@/lib/fetch-json";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { addLikedHighlightId, getHighlightFeedback } from "@/lib/highlight-feedback";
import type {
  AuthorDecisionHistory,
  AuthorDecisionHistoryData,
} from "@/lib/orbit-author-history";
import { confidenceLabel, formatConfidence } from "@/lib/orbit-decision";
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
import { reviewChrome } from "@/lib/orbit-review-chrome";
import type {
  SimilarCollections,
  SimilarCollectionsData,
} from "@/lib/orbit-similar-collections";
import { cn } from "@/lib/utils";
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
  digestBookmarkIds?: string[] | null;
  source?: string | null;
  feedbackById?: Record<string, "good" | "not_relevant">;
}

function getPreviewText(
  bookmark: BookmarkWithRelations | null,
  fallbackReasoning?: string
): string {
  if (bookmark) return bookmark.tweetText.replace(/\s+/g, " ").trim();
  if (fallbackReasoning) return fallbackReasoning.replace(/\s+/g, " ").trim();
  return "Bookmark preview unavailable.";
}

function formatReviewDate(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getAuthorLabel(bookmark: BookmarkWithRelations | null): string {
  return bookmark?.authorDisplayName || bookmark?.authorUsername || "Unknown";
}

function getHandleLabel(bookmark: BookmarkWithRelations | null): string {
  return bookmark?.authorUsername ? `@${bookmark.authorUsername}` : "";
}

function draftHasChanges(
  draft: OrbitReviewSuggestionDraft,
  original: OrbitBookmarkSuggestion | null
) {
  const originalDecision = original ? deriveReviewDecision(original) : "keep";
  const originalTagNames = original ? original.tags.map((tag) => tag.name) : [];
  const currentTagNames = splitTagNames(draft.tagNames);
  const originalTagSet = new Set(originalTagNames);
  const currentTagSet = new Set(currentTagNames);
  const tagsChanged =
    originalTagSet.size !== currentTagSet.size ||
    [...originalTagSet].some((tag) => !currentTagSet.has(tag));
  const originalCollection = original?.collection?.name || "";

  return (
    draft.decision !== originalDecision ||
    tagsChanged ||
    draft.collectionName.trim() !== originalCollection
  );
}

export function OrbitReviewModal({
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
  source,
  feedbackById = {},
}: OrbitReviewDialogProps) {
  const { isOrbital } = useOrbitalTheme();
  const rcx = reviewChrome(isOrbital);
  const queryClient = useQueryClient();

  const [draftState, setDraftState] = useState<{
    key: string;
    drafts: OrbitReviewSuggestionDraft[];
  }>(() => ({ key: "empty", drafts: [] }));
  const [createCollectionsState, setCreateCollectionsState] = useState<{
    key: string;
    value: boolean;
  }>(() => ({ key: "empty", value: true }));
  const [reviewModeState, setReviewModeState] = useState<{
    key: string;
    mode: "quick" | "deep";
  }>(() => ({ key: "empty", mode: "deep" }));
  const [activeDraftState, setActiveDraftState] = useState<{
    key: string;
    id: string | null;
  }>(() => ({ key: "empty", id: null }));
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [sheetBookmarkId, setSheetBookmarkId] = useState<string | null>(null);
  const [, setFeedbackTick] = useState(0);

  const reviewMode: "quick" | "deep" =
    reviewModeState.key === String(reviewSessionId)
      ? reviewModeState.mode
      : "deep";
  const isQuick = reviewMode === "quick";

  const bookmarkById = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );

  const sourcePlan = useMemo<OrbitScanPlan | null>(() => {
    if (!plan) return null;

    const suggestions = plan.plan.suggestions.filter((suggestion) => {
      if (dismissedBookmarkIds.has(suggestion.bookmarkId)) return false;
      if (focusBookmarkId && !(digestBookmarkIds && digestBookmarkIds.length > 0)) {
        return suggestion.bookmarkId === focusBookmarkId;
      }
      return true;
    });

    return {
      overview: plan.plan.overview,
      suggestions,
    };
  }, [digestBookmarkIds, dismissedBookmarkIds, focusBookmarkId, plan]);

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

  const effectiveDrafts = useMemo(() => {
    let result = drafts;

    if (digestBookmarkIds && digestBookmarkIds.length > 0) {
      const digestSet = new Set(digestBookmarkIds);
      result = result.filter((draft) => digestSet.has(draft.bookmarkId));
    }

    return result.filter(
      (draft) => feedbackById[draft.bookmarkId] !== "not_relevant"
    );
  }, [drafts, digestBookmarkIds, feedbackById]);

  const createCollections =
    createCollectionsState.key === draftKey
      ? createCollectionsState.value
      : true;

  const reviewedPlan = useMemo(() => {
    if (!sourcePlan) return null;

    return buildReviewedOrbitPlan({
      sourcePlan,
      drafts: effectiveDrafts,
      existingTags,
      existingCollections,
    });
  }, [effectiveDrafts, existingCollections, existingTags, sourcePlan]);

  const keptBookmarkIds = useMemo(
    () =>
      effectiveDrafts
        .filter((draft) => draft.decision === "keep")
        .map((draft) => draft.bookmarkId),
    [effectiveDrafts]
  );

  const reviewStats = useMemo(() => {
    const tagAssignments =
      reviewedPlan?.suggestions.reduce(
        (total, suggestion) => total + suggestion.tags.length,
        0
      ) ?? 0;
    const collectionMoves =
      reviewedPlan?.suggestions.filter((suggestion) => suggestion.collection)
        .length ?? 0;

    return {
      applyableBookmarks: effectiveDrafts.length,
      keptBookmarks: keptBookmarkIds.length,
      tagAssignments,
      collectionMoves,
    };
  }, [effectiveDrafts.length, keptBookmarkIds.length, reviewedPlan]);

  const originalSuggestionById = useMemo(() => {
    if (!sourcePlan) return new Map<string, OrbitBookmarkSuggestion>();
    return new Map(
      sourcePlan.suggestions.map((suggestion) => [
        suggestion.bookmarkId,
        suggestion,
      ])
    );
  }, [sourcePlan]);

  const impact = useMemo(() => {
    let addedTagCount = 0;
    let addedCollectionCount = 0;

    effectiveDrafts.forEach((draft) => {
      const original = originalSuggestionById.get(draft.bookmarkId);
      if (!original) return;

      const originalTags = original.tags.map((tag) => tag.name);
      splitTagNames(draft.tagNames).forEach((tag) => {
        if (!originalTags.includes(tag)) addedTagCount += 1;
      });

      if (draft.collectionName.trim() && !original.collection) {
        addedCollectionCount += 1;
      }
    });

    return { addedTagCount, addedCollectionCount };
  }, [effectiveDrafts, originalSuggestionById]);

  const activeDraftKey = useMemo(
    () =>
      [
        reviewSessionId,
        focusBookmarkId ?? "all",
        effectiveDrafts.map((draft) => draft.bookmarkId).join("|"),
      ].join(":"),
    [effectiveDrafts, focusBookmarkId, reviewSessionId]
  );

  const defaultActiveDraftId =
    effectiveDrafts.length === 0
      ? null
      : focusBookmarkId &&
          effectiveDrafts.some((draft) => draft.bookmarkId === focusBookmarkId)
        ? focusBookmarkId
        : effectiveDrafts[0]?.bookmarkId ?? null;

  const activeDraftId =
    activeDraftState.key === activeDraftKey &&
    activeDraftState.id &&
    effectiveDrafts.some((draft) => draft.bookmarkId === activeDraftState.id)
      ? activeDraftState.id
      : defaultActiveDraftId;

  const activeDraftIndex = useMemo(() => {
    if (!activeDraftId) return effectiveDrafts.length > 0 ? 0 : -1;
    const index = effectiveDrafts.findIndex(
      (draft) => draft.bookmarkId === activeDraftId
    );
    return index === -1 && effectiveDrafts.length > 0 ? 0 : index;
  }, [activeDraftId, effectiveDrafts]);

  const activeDraft =
    activeDraftIndex >= 0 ? effectiveDrafts[activeDraftIndex] ?? null : null;
  const activeBookmark = activeDraft
    ? bookmarkById.get(activeDraft.bookmarkId) ?? null
    : null;
  const activeOriginal = activeDraft
    ? originalSuggestionById.get(activeDraft.bookmarkId) ?? null
    : null;
  const activeHasChanges = activeDraft
    ? draftHasChanges(activeDraft, activeOriginal)
    : false;

  const updateDraft = useCallback(
    (bookmarkId: string, patch: Partial<OrbitReviewSuggestionDraft>) => {
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

    if (applied) onOpenChange(false);
  }, [createCollections, keptBookmarkIds, onApply, onOpenChange, reviewedPlan]);

  const moveActiveDraft = useCallback(
    (offset: -1 | 1) => {
      if (effectiveDrafts.length === 0) return;

      setActiveDraftState((current) => {
        const currentId =
          current.key === activeDraftKey ? current.id : activeDraftId;
        const currentIndex = currentId
          ? effectiveDrafts.findIndex((draft) => draft.bookmarkId === currentId)
          : 0;
        const nextIndex = Math.max(
          0,
          Math.min(
            effectiveDrafts.length - 1,
            (currentIndex === -1 ? 0 : currentIndex) + offset
          )
        );
        return {
          key: activeDraftKey,
          id: effectiveDrafts[nextIndex]?.bookmarkId ?? currentId,
        };
      });
    },
    [activeDraftId, activeDraftKey, effectiveDrafts]
  );

  const sheetAuthor = useMemo(() => {
    if (!sheetBookmarkId) return null;
    return bookmarkById.get(sheetBookmarkId)?.authorUsername ?? null;
  }, [bookmarkById, sheetBookmarkId]);

  const normalizedSheetAuthor = sheetAuthor?.trim().toLowerCase() ?? null;

  const {
    data: authorData,
    isLoading: authorLoading,
    isFetching: authorFetching,
    isError: authorHistoryError,
  } = useQuery<AuthorDecisionHistoryData>({
    queryKey: ["orbit", "author-history", normalizedSheetAuthor],
    queryFn: async () => {
      if (!sheetAuthor) return null;
      const normalized = sheetAuthor.trim().toLowerCase();
      return fetchJson<AuthorDecisionHistoryData>(
        `/api/orbit/author-history?authorUsername=${encodeURIComponent(normalized)}`
      );
    },
    enabled: isEditSheetOpen && !!normalizedSheetAuthor,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const authorHistoryForSheet = useMemo<AuthorDecisionHistory>(() => {
    if (!sheetAuthor || authorHistoryError) return null;
    if (authorLoading || authorFetching) {
      return { authorUsername: sheetAuthor, loading: true };
    }
    return authorData ?? null;
  }, [
    authorData,
    authorFetching,
    authorHistoryError,
    authorLoading,
    sheetAuthor,
  ]);

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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const similarCollectionsForSheet = useMemo<SimilarCollections>(() => {
    if (!sheetBookmarkId || similarCollectionsError) return null;
    if (similarLoading || similarFetching) return { loading: true };
    return similarData ?? null;
  }, [
    sheetBookmarkId,
    similarCollectionsError,
    similarData,
    similarFetching,
    similarLoading,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;

      const target = event.target as HTMLElement | null;
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

      const key = event.key.toLowerCase();
      if (key === "q") {
        event.preventDefault();
        setReviewModeState((prev) => {
          const currentMode =
            prev.key === String(reviewSessionId) ? prev.mode : "deep";
          const next = currentMode === "quick" ? "deep" : "quick";
          trackFlywheelEvent(next === "quick" ? "mode.quick" : "mode.deep", {
            via: "keyboard",
          });
          return { key: String(reviewSessionId), mode: next };
        });
      } else if (
        key === "j" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        moveActiveDraft(1);
      } else if (
        key === "k" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        moveActiveDraft(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveActiveDraft, open, reviewSessionId]);

  const handleBulkApplySuggested = useCallback(() => {
    if (!sourcePlan) return;
    setDraftState({ key: draftKey, drafts: createOrbitReviewDraft(sourcePlan) });
  }, [draftKey, sourcePlan]);

  const handleBulkKeepAll = useCallback(() => {
    effectiveDrafts.forEach((draft) =>
      updateDraft(draft.bookmarkId, { decision: "keep", included: false })
    );
  }, [effectiveDrafts, updateDraft]);

  const handleBulkTagOnly = useCallback(() => {
    setDraftState((prev) => {
      const activeDrafts =
        prev.key === draftKey && prev.drafts.length > 0
          ? prev.drafts
          : drafts;
      const visibleIds = new Set(
        effectiveDrafts.map((draft) => draft.bookmarkId)
      );

      return {
        key: draftKey,
        drafts: activeDrafts.map((draft) =>
          visibleIds.has(draft.bookmarkId)
            ? {
                ...draft,
                decision: "tags" as OrbitReviewDecision,
                included: true,
              }
            : draft
        ),
      };
    });
  }, [draftKey, drafts, effectiveDrafts]);

  const handleResetOne = useCallback(
    (bookmarkId: string) => {
      const original = originalSuggestionById.get(bookmarkId);
      if (!original) return;
      const fresh = createOrbitReviewDraftFromSuggestion(original);
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

  const handleAcceptOrbitSuggestion = useCallback(
    (bookmarkId: string) => {
      const original = originalSuggestionById.get(bookmarkId);
      if (!original) return;

      const bookmark = bookmarkById.get(bookmarkId);
      const author = bookmark?.authorUsername?.trim().toLowerCase() ?? null;
      const authorHistory = author
        ? queryClient.getQueryData<AuthorDecisionHistoryData>([
            "orbit",
            "author-history",
            author,
          ])
        : undefined;
      const similarCollections = queryClient.getQueryData<SimilarCollectionsData>([
        "orbit",
        "similar-collections",
        bookmarkId,
      ]);

      const patch =
        getQuickSmartPatch(
          original,
          authorHistory !== undefined ? authorHistory : null,
          similarCollections !== undefined ? similarCollections : null
        ) ?? createOrbitReviewDraftFromSuggestion(original);

      updateDraft(bookmarkId, {
        decision: patch.decision,
        included: patch.decision !== "keep",
        tagNames: patch.tagNames ?? "",
        collectionName: patch.collectionName ?? "",
        collectionDescription: patch.collectionDescription ?? "",
      });
    },
    [bookmarkById, originalSuggestionById, queryClient, updateDraft]
  );

  const handleMarkRemainingGood = useCallback(() => {
    let marked = 0;
    effectiveDrafts.forEach((draft) => {
      if (getHighlightFeedback(draft.bookmarkId) !== "not_relevant") {
        addLikedHighlightId(draft.bookmarkId);
        marked += 1;
      }
    });

    if (marked > 0) {
      toast.success(`Marked ${marked} as Good - boosts future Highlights`);
    }
    setFeedbackTick((tick) => tick + 1);
  }, [effectiveDrafts]);

  const canApply = Boolean(
    reviewedPlan &&
      (reviewedPlan.suggestions.length > 0 || keptBookmarkIds.length > 0)
  );
  const isDigestReview =
    source === "weekly-gems" ||
    Boolean(digestBookmarkIds && digestBookmarkIds.length > 0);
  const title = focusBookmarkId
    ? isDigestReview
      ? "Weekly Gems review"
      : "Review bookmark move"
    : isDigestReview
      ? "Weekly Gems review"
      : "Review Orbit pass";
  const activePositionLabel =
    activeDraftIndex >= 0
      ? `${activeDraftIndex + 1} / ${effectiveDrafts.length}`
      : `0 / ${effectiveDrafts.length}`;
  const activePreview = getPreviewText(activeBookmark, activeOriginal?.reasoning);
  const activeFeedback = activeDraft
    ? getHighlightFeedback(activeDraft.bookmarkId) ??
      feedbackById[activeDraft.bookmarkId]
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-background/35 supports-backdrop-filter:backdrop-blur-xl dark:bg-black/45"
        className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[1180px] overflow-hidden border border-hairline-strong bg-surface-1/78 p-0 shadow-[0_30px_120px_-50px_rgba(0,0,0,0.95)] supports-[backdrop-filter]:backdrop-blur-2xl sm:max-w-[1180px]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Review Orbit suggestions, edit destinations, and apply selected
          decisions.
        </DialogDescription>

        <div
          data-orbit-review-modal
          className="grid max-h-[calc(100dvh-1.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]"
        >
          <main className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
                    <OrbitLogoMark className="size-3" aria-hidden="true" />
                    {isDigestReview ? "Weekly Gems" : "Orbit review"}
                  </span>
                  <span className={cn(rcx.data, "text-muted-foreground")}>
                    {activePositionLabel}
                  </span>
                  {activeOriginal?.confidence ? (
                    <span className="rounded-sm border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-emerald-500">
                      {confidenceLabel(activeOriginal.confidence)}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
                  {activeBookmark
                    ? getAuthorLabel(activeBookmark)
                    : activeDraft
                      ? "Orbit suggestion"
                      : title}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {activeBookmark ? (
                    <>
                      {getHandleLabel(activeBookmark) ? (
                        <span>{getHandleLabel(activeBookmark)}</span>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>{formatReviewDate(activeBookmark.tweetCreatedAt)}</span>
                    </>
                  ) : activeDraft ? (
                    <span>Bookmark details are outside the current queue page.</span>
                  ) : (
                    <span>
                      {sourcePlan
                        ? "No suggestions are waiting for review."
                        : "Grok is preparing suggestions for this review."}
                    </span>
                  )}
                  {activeHasChanges ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-amber-500">Edited</span>
                    </>
                  ) : null}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Close Orbit review"
                className="rounded-sm border border-hairline-soft bg-surface-2/60 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            {activeBookmark ? (
              <BookmarkPostPreview
                tweetText={activeBookmark.tweetText}
                authorUsername={activeBookmark.authorUsername}
                media={activeBookmark.media}
                tweetLink={{
                  authorUsername: activeBookmark.authorUsername,
                  tweetId: activeBookmark.tweetId,
                }}
                bookmarkKey={activeBookmark.id}
                variant="feed"
                priorityMedia
                stopClickPropagation
                className="mt-5"
                textClassName="whitespace-pre-wrap break-words text-[17px] leading-8 text-foreground"
                galleryClassName="!mt-4 border-hairline-strong bg-black/10"
              />
            ) : (
              <div className={cn("mt-5 p-6 text-center text-sm", rcx.panel, rcx.soft)}>
                {activeDraft
                  ? activePreview
                  : !sourcePlan
                  ? "Grok is preparing suggestions for this review."
                  : "No suggestions are waiting for review."}
              </div>
            )}

            {activeBookmark?.quotedTweet ? (
              <div className="mt-4 rounded-sm border border-hairline-soft bg-surface-2/45 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm">
                  <span className="font-medium text-foreground">
                    {activeBookmark.quotedTweet.author?.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    @{activeBookmark.quotedTweet.author?.username}
                  </span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {activeBookmark.quotedTweet.text}
                </p>
              </div>
            ) : null}

            {activeDraft ? (
              <section className="mt-5 rounded-sm border border-primary/20 bg-primary/[0.07] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <GrokMark className="size-3.5" />
                      Grok suggestion
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {activeOriginal?.reasoning || activePreview}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      className={rcx.ghostBtn}
                      onClick={() => moveActiveDraft(-1)}
                      disabled={activeDraftIndex <= 0}
                      aria-label="Previous review item"
                    >
                      <ArrowLeft className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      className={rcx.ghostBtn}
                      onClick={() => moveActiveDraft(1)}
                      disabled={
                        activeDraftIndex === -1 ||
                        activeDraftIndex >= effectiveDrafts.length - 1
                      }
                      aria-label="Next review item"
                    >
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {activeFeedback ? (
                  <div className="mt-3 text-[11px] text-emerald-500/90">
                    {activeFeedback === "good"
                      ? "You marked this Good in Highlights."
                      : "You marked this Not relevant in Highlights."}
                  </div>
                ) : null}

                <div className="mt-4 rounded-sm border border-hairline-soft bg-surface-1/55 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {isQuick ? (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 border-emerald-400/30 bg-emerald-500/10 text-xs text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-200"
                        onClick={() =>
                          handleAcceptOrbitSuggestion(activeDraft.bookmarkId)
                        }
                        disabled={applying}
                      >
                        <Sparkles className="size-3.5" />
                        Accept Orbit suggestion
                      </Button>
                    ) : null}

                    <div className="rounded-sm border border-hairline-soft bg-surface-2/70 p-px">
                      <OrbitReviewDecisionControl
                        value={activeDraft.decision}
                        onChange={(decision) =>
                          updateDraft(activeDraft.bookmarkId, {
                            decision,
                            included: decision !== "keep",
                          })
                        }
                      />
                    </div>

                    <div className="ml-auto flex items-center gap-1.5">
                      {activeHasChanges ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleResetOne(activeDraft.bookmarkId)}
                          disabled={applying}
                        >
                          <RotateCcw className="size-3.5" />
                          Reset
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 border-hairline-soft bg-surface-2 text-xs text-foreground hover:bg-accent-soft"
                        onClick={() => {
                          setSheetBookmarkId(activeDraft.bookmarkId);
                          setIsEditSheetOpen(true);
                        }}
                      >
                        Details
                      </Button>
                    </div>
                  </div>

                  {activeDraft.decision !== "keep" ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {orbitReviewDecisionUsesTags(activeDraft.decision) ? (
                        <div className={rcx.fieldShell}>
                          <div className={cn(rcx.label, "mb-2 flex items-center gap-1.5")}>
                            <Tags className="size-3" />
                            Tags
                          </div>
                          <OrbitReviewTagField
                            tagNames={activeDraft.tagNames}
                            included
                            existingTags={existingTags}
                            onTagNamesChange={(tagNames) =>
                              updateDraft(activeDraft.bookmarkId, { tagNames })
                            }
                          />
                        </div>
                      ) : null}

                      {orbitReviewDecisionUsesCollection(activeDraft.decision) ? (
                        <div className={rcx.fieldShell}>
                          <div className={cn(rcx.label, "mb-2 flex items-center gap-1.5")}>
                            <FolderInput className="size-3" />
                            Collection
                          </div>
                          <OrbitReviewCollectionField
                            collectionName={activeDraft.collectionName}
                            collectionDescription={
                              activeDraft.collectionDescription
                            }
                            included
                            namePlaceholder="No collection move"
                            existingCollections={existingCollections}
                            onCollectionNameChange={(collectionName) =>
                              updateDraft(activeDraft.bookmarkId, {
                                collectionName,
                              })
                            }
                            onCollectionDescriptionChange={(
                              collectionDescription
                            ) =>
                              updateDraft(activeDraft.bookmarkId, {
                                collectionDescription,
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-sm border border-hairline-soft bg-surface-2/45 p-3 text-sm text-muted-foreground">
                      This bookmark will stay in Orbit unchanged for this pass.
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </main>

          <aside className="flex min-h-0 flex-col border-t border-hairline-soft bg-surface-2/48 supports-[backdrop-filter]:backdrop-blur-xl lg:border-l lg:border-t-0">
            <div className="border-b border-hairline-soft px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn(rcx.label, "flex items-center gap-2")}>
                    <ListChecks className="size-3.5" />
                    {title}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {reviewStats.applyableBookmarks} review item
                    {reviewStats.applyableBookmarks === 1 ? "" : "s"} ready
                  </div>
                </div>
                <div className={cn(rcx.data, "rounded-sm border border-hairline-soft bg-surface-1/70 px-2 py-1")}>
                  {activePositionLabel}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                  <div className={rcx.soft}>Apply</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {reviewStats.applyableBookmarks - reviewStats.keptBookmarks}
                  </div>
                </div>
                <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                  <div className={rcx.soft}>Keep</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {reviewStats.keptBookmarks}
                  </div>
                </div>
                <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                  <div className={rcx.soft}>Tags</div>
                  <div className="mt-1 font-semibold text-primary">
                    +{impact.addedTagCount || reviewStats.tagAssignments}
                  </div>
                </div>
                <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                  <div className={rcx.soft}>Collections</div>
                  <div className="mt-1 font-semibold text-primary">
                    +{impact.addedCollectionCount || reviewStats.collectionMoves}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <div
                  className={cn(
                    "inline-flex items-center p-0.5 text-[10px]",
                    rcx.toggleShell
                  )}
                  role="group"
                  aria-label="Review mode"
                >
                  <button
                    type="button"
                    aria-pressed={isQuick}
                    onClick={() => {
                      trackFlywheelEvent("mode.quick", { via: "click" });
                      setReviewModeState({
                        key: String(reviewSessionId),
                        mode: "quick",
                      });
                    }}
                    className={cn(
                      "rounded-sm px-2.5 py-1 font-medium transition-colors",
                      isQuick ? rcx.toggleActive : rcx.toggleIdle
                    )}
                  >
                    Quick
                  </button>
                  <button
                    type="button"
                    aria-pressed={!isQuick}
                    onClick={() => {
                      trackFlywheelEvent("mode.deep", { via: "click" });
                      setReviewModeState({
                        key: String(reviewSessionId),
                        mode: "deep",
                      });
                    }}
                    className={cn(
                      "rounded-sm px-2.5 py-1 font-medium transition-colors",
                      !isQuick ? rcx.toggleActive : rcx.toggleIdle
                    )}
                  >
                    Deep
                  </button>
                </div>
                <kbd className="rounded border border-hairline-soft bg-surface-1/70 px-1.5 py-1 text-[9px] text-muted-foreground">
                  Q
                </kbd>
              </div>
            </div>

            <div className="border-b border-hairline-soft px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {isDigestReview ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn("h-8 text-xs", rcx.ghostBtn)}
                      onClick={handleBulkKeepAll}
                      disabled={applying}
                    >
                      Keep remaining
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                      onClick={handleBulkApplySuggested}
                      disabled={applying}
                    >
                      Accept strong
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleMarkRemainingGood}
                      disabled={applying}
                    >
                      Mark Good
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn("h-8 gap-1.5 text-xs", rcx.ghostBtn)}
                      onClick={handleBulkApplySuggested}
                      disabled={applying}
                    >
                      <RotateCcw className="size-3.5" />
                      Restore
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn("h-8 text-xs", rcx.ghostBtn)}
                      onClick={handleBulkKeepAll}
                      disabled={applying}
                    >
                      Keep all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn("h-8 text-xs", rcx.ghostBtn)}
                      onClick={handleBulkTagOnly}
                      disabled={applying}
                    >
                      Tag all
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline-soft pt-3">
                <span className="text-xs text-muted-foreground">
                  Create new collections
                </span>
                <Switch
                  checked={createCollections}
                  onCheckedChange={handleCreateCollectionsChange}
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-4">
                {effectiveDrafts.length === 0 ? (
                  <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-4 text-sm text-muted-foreground">
                    No suggestions are waiting for review.
                  </div>
                ) : null}

                {effectiveDrafts.map((draft, index) => {
                  const bookmark = bookmarkById.get(draft.bookmarkId) ?? null;
                  const original =
                    originalSuggestionById.get(draft.bookmarkId) ?? null;
                  const changed = draftHasChanges(draft, original);
                  const selected = draft.bookmarkId === activeDraft?.bookmarkId;

                  return (
                    <button
                      key={draft.bookmarkId}
                      type="button"
                      onClick={() =>
                        setActiveDraftState({
                          key: activeDraftKey,
                          id: draft.bookmarkId,
                        })
                      }
                      className={cn(
                        "w-full rounded-sm border p-3 text-left transition-colors",
                        selected
                          ? "border-primary/45 bg-primary/10"
                          : "border-hairline-soft bg-surface-1/55 hover:border-primary/25 hover:bg-accent-soft"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {getAuthorLabel(bookmark)}
                        </span>
                        <span className={cn(rcx.data, "shrink-0 text-muted-foreground")}>
                          {index + 1}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {getPreviewText(bookmark, original?.reasoning)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-sm border border-hairline-soft bg-surface-2/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {getDecisionLabel(draft.decision)}
                        </span>
                        {original?.confidence ? (
                          <span
                            className="rounded-sm border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                            title={formatConfidence(original.confidence)}
                          >
                            {original.confidence}
                          </span>
                        ) : null}
                        {changed ? (
                          <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
                            edited
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="border-t border-hairline-soft bg-background/80 px-4 py-4">
              <Button
                className="h-10 w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
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
            </div>
          </aside>
        </div>

        <OrbitReviewEditSheet
          open={isEditSheetOpen}
          onOpenChange={(nextOpen) => {
            setIsEditSheetOpen(nextOpen);
            if (!nextOpen) setSheetBookmarkId(null);
          }}
          draft={drafts.find((draft) => draft.bookmarkId === sheetBookmarkId) ?? null}
          original={
            sheetBookmarkId
              ? originalSuggestionById.get(sheetBookmarkId) ?? null
              : null
          }
          bookmark={
            sheetBookmarkId ? bookmarkById.get(sheetBookmarkId) ?? null : null
          }
          existingTags={existingTags}
          existingCollections={existingCollections}
          onDraftChange={(id, patch) => updateDraft(id, patch)}
          onReset={(id) => handleResetOne(id)}
          authorHistory={authorHistoryForSheet}
          similarCollections={similarCollectionsForSheet}
          reviewMode={reviewMode}
          reviewSessionId={reviewSessionId}
        />
      </DialogContent>
    </Dialog>
  );
}

export function OrbitReviewDialog(props: OrbitReviewDialogProps) {
  return <OrbitReviewModal {...props} />;
}
