"use client";

import { useCallback, useMemo, useState, type ElementType } from "react";
import {
  CheckCircle2,
  Folder,
  Loader2,
  RotateCcw,
  Tag as TagIcon,
  X,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { OrbitReviewEditSheet } from "@/components/orbit/orbit-review-edit-sheet";
import {
  OrbitReviewTagField,
  OrbitReviewCollectionField,
  OrbitReviewDecisionControl,
  getDecisionLabel,
} from "@/components/orbit/orbit-review-fields";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReviewedOrbitPlan,
  createOrbitReviewDraft,
  createOrbitReviewDraftFromSuggestion,
  deriveReviewDecision,
  orbitReviewDecisionUsesCollection,
  orbitReviewDecisionUsesTags,
  splitTagNames,
  type OrbitReviewDecision,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import { confidenceLabel, formatConfidence } from "@/lib/orbit-decision";
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

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [sheetBookmarkId, setSheetBookmarkId] = useState<string | null>(null);

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
    const keptBookmarks = drafts.filter((draft) => draft.decision === "keep")
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
      applyableBookmarks: reviewedPlan?.suggestions.length ?? 0,
      keptBookmarks,
      tagAssignments,
      collectionMoves,
    };
  }, [drafts, reviewedPlan]);

  const keptBookmarkIds = useMemo(
    () =>
      drafts
        .filter((draft) => draft.decision === "keep")
        .map((draft) => draft.bookmarkId),
    [drafts]
  );

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
    drafts.forEach((draft) => {
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
  }, [drafts, originalSuggestionById]);

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
    [createOrbitReviewDraftFromSuggestion, originalSuggestionById, updateDraft]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border border-white/10 bg-slate-950 p-0 text-white sm:max-w-5xl">
        <DialogHeader className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/10 text-sky-100">
              <GrokMark className="size-4" title="Grok" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1 text-white/60">
                Choose what to do with each suggestion, then adjust the tags and
                destinations that will be applied.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Refined Native-First Orbit Review — vertical list of native-style cards + Impact Bar */}
        <div className="min-h-0 overflow-hidden px-4 py-3">
          {/* Global Impact Bar (styled like rail metrics) */}
          {drafts.length > 0 && (
            <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-[11px]">
                  <div><span className="text-white/45">Apply</span> <span className="font-medium tabular-nums">{reviewStats.applyableBookmarks}</span></div>
                  <div><span className="text-white/45">Keep</span> <span className="font-medium tabular-nums">{reviewStats.keptBookmarks}</span></div>
                  <div><span className="text-sky-300/80">+{impact.addedTagCount} tags</span></div>
                  <div><span className="text-sky-300/80">+{impact.addedCollectionCount} cols</span></div>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleBulkApplySuggested} disabled={applying}>
                    <RotateCcw className="mr-1 size-3" /> Restore all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkKeepAll} disabled={applying}>
                    Keep all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkTagOnly} disabled={applying}>
                    Tag all
                  </Button>

                  <div className="ml-2 flex items-center gap-2 border-l border-white/10 pl-3">
                    <span className="text-xs text-white/60">New collections</span>
                    <Switch checked={createCollections} onCheckedChange={handleCreateCollectionsChange} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <ScrollArea className="h-[58vh]">
            <div className="space-y-3 pb-6">
              {drafts.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-white/50">
                  No suggestions are waiting for review.
                </div>
              )}

              {drafts.map((draft) => {
                const bookmark = bookmarkById.get(draft.bookmarkId) ?? null;
                const preview = getPreviewText(bookmark);
                const original = originalSuggestionById.get(draft.bookmarkId) ?? null;

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
                      "group relative rounded-2xl border border-hairline-soft bg-surface-1 shadow-sm transition-all",
                      draft.decision === "keep" && "opacity-75",
                      sheetBookmarkId === draft.bookmarkId && "border-sky-400/50 bg-surface-2/70",
                      "hover:border-white/20 hover:bg-surface-2/50"
                    )}
                  >
                    {/* Header — native to triage card + focus strip */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-white/90">
                          @{bookmark?.authorUsername || draft.bookmarkId}
                        </span>
                        {original && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                              original.confidence === "high" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                              original.confidence === "medium" && "border-sky-400/30 bg-sky-400/10 text-sky-200",
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
                    <div className="px-4 pb-2 text-[13px] leading-snug text-white/80 line-clamp-2">
                      {preview}
                    </div>

                    {/* Grok reasoning — native meta label */}
                    {original?.reasoning && (
                      <div className="px-4 pb-2 text-xs leading-snug text-white/65">
                        {original.reasoning}
                      </div>
                    )}

                    {/* Compact change summary — elegant native treatment */}
                    {hasChanges && (
                      <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5 text-[10px]">
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
                    <div className="relative flex flex-col gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(10,15,29,0.85))] px-4 py-3 rounded-b-2xl">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md border border-white/10 bg-black/20 p-px">
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
                              className="h-7 gap-1 text-[10px] text-white/70 hover:text-white"
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
                              "h-7 gap-1 border-white/20 bg-white/5 text-[10px] text-white/80 hover:bg-white/10",
                              sheetBookmarkId === draft.bookmarkId && "border-sky-400/60 bg-sky-400/10 text-sky-200"
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
                              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
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
                              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
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
          onOpenChange={setIsEditSheetOpen}
          draft={drafts.find((d) => d.bookmarkId === sheetBookmarkId) ?? null}
          original={sheetBookmarkId ? originalSuggestionById.get(sheetBookmarkId) ?? null : null}
          bookmark={sheetBookmarkId ? bookmarkById.get(sheetBookmarkId) ?? null : null}
          existingTags={existingTags}
          existingCollections={existingCollections}
          onDraftChange={(id, patch) => updateDraft(id, patch)}
          onReset={(id) => handleResetOne(id)}
        />

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
            Apply decisions
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
