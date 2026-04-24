"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Folder,
  Loader2,
  Sparkles,
  Tag as TagIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReviewedOrbitPlan,
  createOrbitReviewDraft,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitApplyResult,
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
    opts: { createCollections: boolean }
  ) => Promise<OrbitApplyResult | null>;
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

function getPreviewText(bookmark: BookmarkWithRelations | null): string {
  if (!bookmark) return "Bookmark is outside the current page.";
  return bookmark.tweetText.replace(/\s+/g, " ").trim();
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
}: OrbitReviewDialogProps) {
  const [draftState, setDraftState] = useState<{
    key: string;
    drafts: OrbitReviewSuggestionDraft[];
  }>(() => ({ key: "empty", drafts: [] }));
  const [createCollectionsState, setCreateCollectionsState] = useState<{
    key: string;
    value: boolean;
  }>(() => ({ key: "empty", value: true }));

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

  const createCollections =
    createCollectionsState.key === draftKey ? createCollectionsState.value : true;

  const reviewedPlan = useMemo(() => {
    if (!sourcePlan) return null;

    return buildReviewedOrbitPlan({
      sourcePlan,
      drafts,
      existingTags,
      existingCollections,
    });
  }, [drafts, existingCollections, existingTags, sourcePlan]);

  const reviewStats = useMemo(() => {
    const includedDrafts = drafts.filter((draft) => draft.included).length;
    const tagAssignments =
      reviewedPlan?.suggestions.reduce(
        (total, suggestion) => total + suggestion.tags.length,
        0
      ) ?? 0;
    const collectionMoves =
      reviewedPlan?.suggestions.filter((suggestion) => suggestion.collection)
        .length ?? 0;

    return {
      includedDrafts,
      applyableBookmarks: reviewedPlan?.suggestions.length ?? 0,
      tagAssignments,
      collectionMoves,
    };
  }, [drafts, reviewedPlan]);

  const updateDraft = useCallback(
    (bookmarkId: string, patch: Partial<OrbitReviewSuggestionDraft>) => {
      setDraftState({
        key: draftKey,
        drafts: drafts.map((draft) =>
          draft.bookmarkId === bookmarkId ? { ...draft, ...patch } : draft
        ),
      });
    },
    [draftKey, drafts]
  );

  const handleCreateCollectionsChange = useCallback(
    (value: boolean) => {
      setCreateCollectionsState({ key: draftKey, value });
    },
    [draftKey]
  );

  const handleApply = useCallback(async () => {
    if (!reviewedPlan || reviewedPlan.suggestions.length === 0) return;
    const applied = await onApply(reviewedPlan, { createCollections });
    if (applied) {
      onOpenChange(false);
    }
  }, [createCollections, onApply, onOpenChange, reviewedPlan]);

  const title = focusBookmarkId ? "Review bookmark move" : "Review Orbit pass";
  const canApply = Boolean(reviewedPlan && reviewedPlan.suggestions.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border border-white/10 bg-slate-950 p-0 text-white sm:max-w-5xl">
        <DialogHeader className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/10 text-sky-100">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1 text-white/60">
                Adjust suggested tags and destinations before applying.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <ScrollArea className="max-h-[60vh] min-h-0 pr-3">
            <div className="space-y-3">
              {drafts.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/60">
                  No suggestions are waiting for review.
                </div>
              ) : (
                drafts.map((draft) => {
                  const bookmark = bookmarkById.get(draft.bookmarkId) ?? null;
                  const preview = getPreviewText(bookmark);
                  const checkboxId = `orbit-review-include-${draft.bookmarkId}`;
                  const tagInputId = `orbit-review-tags-${draft.bookmarkId}`;
                  const collectionInputId = `orbit-review-collection-${draft.bookmarkId}`;
                  const descriptionInputId = `orbit-review-description-${draft.bookmarkId}`;

                  return (
                    <div
                      key={draft.bookmarkId}
                      className={cn(
                        "rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-sm",
                        !draft.included && "opacity-60"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={checkboxId}
                          checked={draft.included}
                          onCheckedChange={(checked) =>
                            updateDraft(draft.bookmarkId, {
                              included: checked === true,
                            })
                          }
                          aria-label="Include suggestion"
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Label
                              htmlFor={checkboxId}
                              className="min-w-0 text-sm text-white"
                            >
                              <span className="truncate">
                                {bookmark
                                  ? `@${bookmark.authorUsername}`
                                  : draft.bookmarkId}
                              </span>
                            </Label>
                            <Badge
                              variant="outline"
                              className="border-white/12 bg-white/5 text-[10px] uppercase tracking-[0.16em] text-white/60"
                            >
                              {draft.included ? "Included" : "Skipped"}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/55">
                            {preview}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={tagInputId}
                            className="gap-1.5 text-xs text-white/70"
                          >
                            <TagIcon className="size-3.5" />
                            Tags
                          </Label>
                          <Input
                            id={tagInputId}
                            value={draft.tagNames}
                            onChange={(event) =>
                              updateDraft(draft.bookmarkId, {
                                tagNames: event.target.value,
                              })
                            }
                            disabled={!draft.included}
                            placeholder="research, ai, tools"
                            className="border-white/12 bg-white/[0.04] text-white placeholder:text-white/30"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label
                            htmlFor={collectionInputId}
                            className="gap-1.5 text-xs text-white/70"
                          >
                            <Folder className="size-3.5" />
                            Collection
                          </Label>
                          <Input
                            id={collectionInputId}
                            value={draft.collectionName}
                            onChange={(event) =>
                              updateDraft(draft.bookmarkId, {
                                collectionName: event.target.value,
                              })
                            }
                            disabled={!draft.included}
                            placeholder="No collection move"
                            className="border-white/12 bg-white/[0.04] text-white placeholder:text-white/30"
                          />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                          <Label
                            htmlFor={descriptionInputId}
                            className="text-xs text-white/70"
                          >
                            Collection description
                          </Label>
                          <Textarea
                            id={descriptionInputId}
                            value={draft.collectionDescription}
                            onChange={(event) =>
                              updateDraft(draft.bookmarkId, {
                                collectionDescription: event.target.value,
                              })
                            }
                            disabled={!draft.included || !draft.collectionName.trim()}
                            placeholder="Optional for new collection moves"
                            className="min-h-14 border-white/12 bg-white/[0.04] text-white placeholder:text-white/30"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <aside className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p
                className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80"
                style={MONO_STYLE}
              >
                Review summary
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <SummaryStat label="Included" value={reviewStats.includedDrafts} />
                <SummaryStat
                  label="Applied"
                  value={reviewStats.applyableBookmarks}
                />
                <SummaryStat label="Tags" value={reviewStats.tagAssignments} />
                <SummaryStat
                  label="Moves"
                  value={reviewStats.collectionMoves}
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    New collections
                  </p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {createCollections ? "Allowed" : "Existing only"}
                  </p>
                </div>
                <Switch
                  checked={createCollections}
                  onCheckedChange={handleCreateCollectionsChange}
                />
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="border-white/10 bg-slate-950/95 px-5 py-4">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            className="gap-1.5 bg-white text-slate-950 hover:bg-white/90"
            onClick={handleApply}
            disabled={!canApply || applying}
          >
            {applying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Apply reviewed plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}
