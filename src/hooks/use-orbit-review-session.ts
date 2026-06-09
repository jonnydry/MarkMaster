"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getHighlightFeedback } from "@/lib/highlight-feedback";
import type { AuthorDecisionHistoryData } from "@/lib/orbit-author-history";
import {
  buildReviewedOrbitPlan,
  createOrbitReviewDraft,
  createOrbitReviewDraftFromSuggestion,
  deriveReviewDecision,
  getDraftAppliedImpact,
  getQuickSmartPatch,
  splitTagNames,
  summarizeReviewBatchImpact,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import { getDecisionLabel } from "@/components/orbit/orbit-review-fields";
import type { SimilarCollectionsData } from "@/lib/orbit-similar-collections";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitApplyResult,
  OrbitBookmarkSuggestion,
  OrbitDecisionEventPayload,
  OrbitScanPlan,
  OrbitScanResponsePayload,
  TagWithCount,
} from "@/types";

export interface UseOrbitReviewSessionArgs {
  open: boolean;
  plan: OrbitScanResponsePayload | null;
  bookmarks: BookmarkWithRelations[];
  dismissedBookmarkIds: Set<string>;
  existingTags: TagWithCount[];
  existingCollections: CollectionWithCount[];
  focusBookmarkId: string | null;
  reviewSessionId: number;
  digestBookmarkIds?: string[] | null;
  source?: string | null;
  feedbackById?: Record<string, "good" | "not_relevant">;
  onApply: (
    reviewedPlan: OrbitScanPlan,
    opts: {
      createCollections: boolean;
      keptBookmarkIds: string[];
      decisionEvents: OrbitDecisionEventPayload[];
    }
  ) => Promise<OrbitApplyResult | null>;
  onOpenChange: (open: boolean) => void;
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

function buildDecisionEvent(args: {
  draft: OrbitReviewSuggestionDraft;
  original: OrbitBookmarkSuggestion | null;
  reviewed: OrbitBookmarkSuggestion | null;
  source: string;
}): OrbitDecisionEventPayload {
  const action: OrbitDecisionEventPayload["action"] =
    args.draft.decision === "keep"
      ? "kept"
      : draftHasChanges(args.draft, args.original)
        ? "edited"
        : "accepted";

  return {
    bookmarkId: args.draft.bookmarkId,
    action,
    source: args.source,
    mode: "deep" as const,
    originalSuggestion: args.original,
    reviewedSuggestion: args.reviewed,
  };
}

export function useOrbitReviewSession({
  open,
  plan,
  bookmarks,
  dismissedBookmarkIds,
  existingTags,
  existingCollections,
  focusBookmarkId,
  reviewSessionId,
  onApply,
  onOpenChange,
  digestBookmarkIds,
  source,
  feedbackById = {},
}: UseOrbitReviewSessionArgs) {
  const queryClient = useQueryClient();

  const [draftState, setDraftState] = useState<{
    key: string;
    drafts: OrbitReviewSuggestionDraft[];
  }>(() => ({ key: "empty", drafts: [] }));
  const [createCollectionsState, setCreateCollectionsState] = useState<{
    key: string;
    value: boolean;
  }>(() => ({ key: "empty", value: true }));
  const [activeDraftState, setActiveDraftState] = useState<{
    key: string;
    id: string | null;
  }>(() => ({ key: "empty", id: null }));

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

  const originalSuggestionById = useMemo(() => {
    if (!sourcePlan) return new Map<string, OrbitBookmarkSuggestion>();
    return new Map(
      sourcePlan.suggestions.map((suggestion) => [
        suggestion.bookmarkId,
        suggestion,
      ])
    );
  }, [sourcePlan]);

  const reviewedSuggestionById = useMemo(() => {
    if (!reviewedPlan) return new Map<string, OrbitBookmarkSuggestion>();
    return new Map(
      reviewedPlan.suggestions.map((suggestion) => [
        suggestion.bookmarkId,
        suggestion,
      ])
    );
  }, [reviewedPlan]);

  const keptBookmarkIds = useMemo(
    () =>
      effectiveDrafts
        .filter((draft) => draft.decision === "keep")
        .map((draft) => draft.bookmarkId),
    [effectiveDrafts]
  );

  const decisionEvents = useMemo<OrbitDecisionEventPayload[]>(() => {
    if (!sourcePlan) return [];
    const eventSource =
      source ?? (digestBookmarkIds && digestBookmarkIds.length > 0
        ? "weekly-gems"
        : "orbit-review");

    return effectiveDrafts.map((draft) =>
      buildDecisionEvent({
        draft,
        original: originalSuggestionById.get(draft.bookmarkId) ?? null,
        reviewed: reviewedSuggestionById.get(draft.bookmarkId) ?? null,
        source: eventSource,
      })
    );
  }, [
    digestBookmarkIds,
    effectiveDrafts,
    originalSuggestionById,
    reviewedSuggestionById,
    source,
    sourcePlan,
  ]);

  const batchImpactSummary = useMemo(
    () => summarizeReviewBatchImpact(effectiveDrafts),
    [effectiveDrafts]
  );

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
  const activeDraftImpact = activeDraft
    ? getDraftAppliedImpact(activeDraft)
    : null;

  const isDigestReview =
    source === "weekly-gems" ||
    Boolean(digestBookmarkIds && digestBookmarkIds.length > 0);
  const title = isDigestReview ? "Weekly Gems review" : "Orbit review";
  const activePositionLabel =
    activeDraftIndex >= 0
      ? `${activeDraftIndex + 1} / ${effectiveDrafts.length}`
      : `0 / ${effectiveDrafts.length}`;

  const updateDraft = useCallback(
    (bookmarkId: string, patch: Partial<OrbitReviewSuggestionDraft>) => {
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
    [draftKey, drafts]
  );

  const setActiveDraftId = useCallback(
    (bookmarkId: string) => {
      setActiveDraftState({ key: activeDraftKey, id: bookmarkId });
    },
    [activeDraftKey]
  );

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
        decision: patch.decision ?? "keep",
        included: (patch.decision ?? "keep") !== "keep",
        tagNames: patch.tagNames ?? "",
        collectionName: patch.collectionName ?? "",
        collectionDescription: patch.collectionDescription ?? "",
      });
    },
    [bookmarkById, originalSuggestionById, queryClient, updateDraft]
  );

  const advanceAfterResolve = useCallback((resolvedBookmarkId: string) => {
    const remainingDrafts = effectiveDrafts.filter(
      (draft) => draft.bookmarkId !== resolvedBookmarkId
    );

    if (remainingDrafts.length === 0) {
      onOpenChange(false);
      return;
    }

    const fallbackIndex = Math.max(
      0,
      Math.min(activeDraftIndex, remainingDrafts.length - 1)
    );
    const nextId = remainingDrafts[fallbackIndex]?.bookmarkId;
    if (nextId) setActiveDraftId(nextId);
  }, [
    activeDraftIndex,
    effectiveDrafts,
    onOpenChange,
    setActiveDraftId,
  ]);

  const handleApplyAll = useCallback(async () => {
    if (
      !reviewedPlan ||
      (reviewedPlan.suggestions.length === 0 && keptBookmarkIds.length === 0)
    ) {
      return;
    }

    const applied = await onApply(reviewedPlan, {
      createCollections,
      keptBookmarkIds,
      decisionEvents,
    });

    if (applied) onOpenChange(false);
  }, [
    createCollections,
    decisionEvents,
    keptBookmarkIds,
    onApply,
    onOpenChange,
    reviewedPlan,
  ]);

  const handleApplyCurrent = useCallback(async () => {
    if (!activeDraft || !sourcePlan) return;

    const singlePlan = buildReviewedOrbitPlan({
      sourcePlan,
      drafts: [activeDraft],
      existingTags,
      existingCollections,
    });
    const singleKept =
      activeDraft.decision === "keep" ? [activeDraft.bookmarkId] : [];
    const singleEvents = decisionEvents.filter(
      (event) => event.bookmarkId === activeDraft.bookmarkId
    );

    const applied = await onApply(singlePlan, {
      createCollections,
      keptBookmarkIds: singleKept,
      decisionEvents: singleEvents,
    });

    if (applied) advanceAfterResolve(activeDraft.bookmarkId);
  }, [
    activeDraft,
    advanceAfterResolve,
    createCollections,
    decisionEvents,
    existingCollections,
    existingTags,
    onApply,
    sourcePlan,
  ]);

  const handleKeepCurrent = useCallback(async () => {
    if (!activeDraft || !sourcePlan) return;
    const keptDraft = {
      ...activeDraft,
      decision: "keep" as const,
      included: false,
    };
    updateDraft(activeDraft.bookmarkId, {
      decision: "keep",
      included: false,
    });
    const singlePlan = buildReviewedOrbitPlan({
      sourcePlan,
      drafts: [keptDraft],
      existingTags,
      existingCollections,
    });
    const keptEvent = buildDecisionEvent({
      draft: keptDraft,
      original: originalSuggestionById.get(activeDraft.bookmarkId) ?? null,
      reviewed: null,
      source:
        source ?? (digestBookmarkIds && digestBookmarkIds.length > 0
          ? "weekly-gems"
          : "orbit-review"),
    });
    const applied = await onApply(singlePlan, {
      createCollections,
      keptBookmarkIds: [activeDraft.bookmarkId],
      decisionEvents: [keptEvent],
    });
    if (applied) advanceAfterResolve(activeDraft.bookmarkId);
  }, [
    activeDraft,
    advanceAfterResolve,
    createCollections,
    digestBookmarkIds,
    existingCollections,
    existingTags,
    onApply,
    originalSuggestionById,
    source,
    sourcePlan,
    updateDraft,
  ]);

  useEffect(() => {
    if (!open) return;
    if (effectiveDrafts.length === 0) {
      onOpenChange(false);
    }
  }, [open, effectiveDrafts.length, onOpenChange]);

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
      if (
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
      } else if (key === "a") {
        event.preventDefault();
        void handleApplyCurrent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleApplyCurrent, moveActiveDraft, open]);

  const pendingApplyCount =
    reviewedPlan?.suggestions.length ?? 0;

  return {
    title,
    isDigestReview,
    plan,
    sourcePlan,
    effectiveDrafts,
    activeBookmark,
    activeDraft,
    activeOriginal,
    activeHasChanges,
    activeDraftImpact,
    activePositionLabel,
    activeDraftIndex,
    batchImpactSummary,
    createCollections,
    setCreateCollections: (value: boolean) =>
      setCreateCollectionsState({ key: draftKey, value }),
    updateDraft,
    setActiveDraftId,
    moveActiveDraft,
    handleResetOne,
    handleAcceptOrbitSuggestion,
    handleApplyCurrent,
    handleKeepCurrent,
    handleApplyAll,
    pendingApplyCount,
    canApplyAll: Boolean(
      reviewedPlan &&
        (reviewedPlan.suggestions.length > 0 || keptBookmarkIds.length > 0)
    ),
    getDecisionLabel,
    draftHasChanges: (draft: OrbitReviewSuggestionDraft) =>
      draftHasChanges(
        draft,
        originalSuggestionById.get(draft.bookmarkId) ?? null
      ),
    originalSuggestionById,
    getDraftAppliedImpact,
    getHighlightFeedback: (id: string) =>
      getHighlightFeedback(id) ?? feedbackById[id] ?? null,
  };
}
