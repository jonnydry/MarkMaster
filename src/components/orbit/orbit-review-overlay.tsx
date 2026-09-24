"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderInput,
  Loader2,
  RotateCcw,
  Sparkles,
  Tags,
} from "lucide-react";

import {
  BookmarkOverlayAuthorHeader,
  BookmarkOverlayPostColumn,
} from "@/components/bookmark-overlay/bookmark-overlay-primitives";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import {
  OrbitReviewCollectionField,
  OrbitReviewDecisionControl,
  OrbitReviewTagField,
} from "@/components/orbit/orbit-review-fields";
import {
  OrbitReviewBatchImpactChips,
  OrbitReviewDraftImpactLine,
  OrbitReviewGrokProposal,
  OrbitReviewQueueProposalChips,
} from "@/components/orbit/orbit-review-proposal";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  useOrbitReviewSession,
  type UseOrbitReviewSessionArgs,
} from "@/hooks/use-orbit-review-session";
import { useTypography } from "@/hooks/use-typography";
import { confidenceLabel } from "@/lib/orbit-decision";
import {
  orbitReviewDecisionUsesCollection,
  orbitReviewDecisionUsesTags,
} from "@/lib/orbit-review";
import {
  appOverlayBackdropClassName,
  appOverlayDialogGridReviewClassName,
  appOverlayDialogReviewClassName,
} from "@/lib/app-layout";
import { cn } from "@/lib/utils";

export type OrbitReviewOverlayProps = UseOrbitReviewSessionArgs & {
  applying: boolean;
  onActiveBookmarkChange?: (bookmarkId: string) => void;
};

export function OrbitReviewOverlay({
  applying,
  onActiveBookmarkChange,
  ...sessionArgs
}: OrbitReviewOverlayProps) {
  const { open, onOpenChange } = sessionArgs;
  const session = useOrbitReviewSession(sessionArgs);
  const [batchOpen, setBatchOpen] = useState(false);
  const t = useTypography();

  const {
    title,
    completion,
    plan,
    effectiveDrafts,
    activeBookmark,
    activeDraft,
    activeOriginal,
    activeHasChanges,
    activeDraftImpact,
    activePositionLabel,
    batchImpactSummary,
    createCollections,
    setCreateCollections,
    updateDraft,
    setActiveDraftId,
    moveActiveDraft,
    handleResetOne,
    handleAcceptOrbitSuggestion,
    handleApplyCurrent,
    handleKeepCurrent,
    handleApplyAll,
    canApplyAll,
    getDecisionLabel,
    draftHasChanges,
    getDraftAppliedImpact,
  } = session;

  const selectDraft = (bookmarkId: string) => {
    setActiveDraftId(bookmarkId);
    onActiveBookmarkChange?.(bookmarkId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={appOverlayBackdropClassName}
        className={appOverlayDialogReviewClassName}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Review Orbit suggestions with full bookmark context.
        </DialogDescription>

        {completion ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-5 sm:p-8">
            <div className="w-full max-w-xl surface-solid p-5 text-center sm:p-7">
              <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden="true" />
              <p className="mt-4 text-xs font-semibold text-primary">
                Orbit review
              </p>
              <h2 className="mt-1 heading-font text-2xl font-bold text-foreground">
                Review complete
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                You reviewed {completion.reviewedCount} bookmark
                {completion.reviewedCount === 1 ? "" : "s"}. Your library is clearer,
                and the next resurfacing mix can use these decisions.
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-y-4 border-y border-hairline-soft py-4 sm:grid-cols-4">
                <CompletionMetric label="Reviewed" value={completion.reviewedCount} />
                <CompletionMetric label="Tag assignments" value={completion.tagAssignments} />
                <CompletionMetric
                  label="Collection moves"
                  value={completion.collectionAssignments}
                />
                <CompletionMetric label="Kept in Orbit" value={completion.keptCount} />
              </dl>

              {completion.createdTags > 0 || completion.createdCollections > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {completion.createdTags > 0
                    ? `${completion.createdTags} new tag${completion.createdTags === 1 ? "" : "s"}`
                    : ""}
                  {completion.createdTags > 0 && completion.createdCollections > 0
                    ? " · "
                    : ""}
                  {completion.createdCollections > 0
                    ? `${completion.createdCollections} new collection${
                        completion.createdCollections === 1 ? "" : "s"
                      }`
                    : ""}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Back to Orbit
                </Button>
                <Link
                  href="/collections"
                  onClick={() => onOpenChange(false)}
                  className={buttonVariants({ variant: "default" })}
                >
                  See improved collections
                </Link>
              </div>
            </div>
          </div>
        ) : activeBookmark && activeDraft ? (
          <div
            data-orbit-review-overlay
            className={appOverlayDialogGridReviewClassName}
          >
            <BookmarkOverlayPostColumn
              bookmark={activeBookmark}
              textClassName="whitespace-pre-wrap break-words text-[17px] leading-8 text-foreground"
              header={
                <BookmarkOverlayAuthorHeader
                  bookmark={activeBookmark}
                  onClose={() => onOpenChange(false)}
                  closeLabel="Close review"
                  badges={
                    <>
                      <span className={cn("inline-flex items-center gap-1.5", t.label, "font-semibold text-primary")}>
                        <OrbitLogoMark className="size-3" aria-hidden="true" />
                        {title}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {activePositionLabel}
                      </span>
                      {activeOriginal?.confidence ? (
                        <span className={cn("rounded-sm bg-success/10 px-1.5 py-0.5", t.label, "text-success")}>
                          {confidenceLabel(activeOriginal.confidence)}
                        </span>
                      ) : null}
                      {activeHasChanges ? (
                        <span className="text-xs text-warning">Edited</span>
                      ) : null}
                    </>
                  }
                />
              }
            />

            {/* Review sidebar */}
            <aside className="flex min-h-0 flex-col border-t border-hairline-soft lg:border-l lg:border-t-0">
              <div className="scrollbar-native min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {/* Collapsed batch summary */}
                {plan && effectiveDrafts.length > 1 ? (
                  <div className="-mx-4 -mt-4 mb-4 border-b border-hairline-soft">
                    <button
                      type="button"
                      onClick={() => setBatchOpen((v) => !v)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-hover"
                      aria-expanded={batchOpen}
                    >
                      {batchOpen ? (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className={cn(t.label, "font-semibold text-foreground")}>
                        Batch
                      </span>
                      <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                        {plan.summary.bookmarkCount} suggested ·{" "}
                        {plan.summary.bookmarksWithTags} tagged ·{" "}
                        {plan.summary.bookmarksWithCollections} collected
                      </span>
                    </button>
                    {batchOpen ? (
                      <div className="px-4 pb-3">
                        <OrbitReviewBatchImpactChips
                          tagNames={batchImpactSummary.tagNames}
                          collectionNames={batchImpactSummary.collectionNames}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Navigation */}
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {activePositionLabel}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="border-hairline-strong"
                      onClick={() => moveActiveDraft(-1)}
                      disabled={session.activeDraftIndex <= 0}
                      aria-label="Previous item"
                    >
                      <ArrowLeft className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="border-hairline-strong"
                      onClick={() => moveActiveDraft(1)}
                      disabled={
                        session.activeDraftIndex >= effectiveDrafts.length - 1
                      }
                      aria-label="Next item"
                    >
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Orbit suggestion */}
                <div className="surface-inset p-3">
                  <div className={cn("flex items-center gap-2", t.label, "font-semibold text-foreground")}>
                    <OrbitLogoMark className="size-3.5 text-primary" />
                    Orbit suggestion
                  </div>
                  {activeOriginal?.reasoning ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {activeOriginal.reasoning}
                    </p>
                  ) : null}
                  <OrbitReviewGrokProposal
                    original={activeOriginal}
                    decision={activeDraft.decision}
                    className="mt-3"
                  />
                  <div className="mt-3 border-t border-hairline-soft pt-2">
                    <OrbitReviewDraftImpactLine
                      tagNames={activeDraftImpact?.tagNames ?? []}
                      collectionName={activeDraftImpact?.collectionName ?? null}
                    />
                  </div>
                </div>

                {/* Decision controls */}
                <div className="mt-4 space-y-3">
                  <OrbitReviewDecisionControl
                    value={activeDraft.decision}
                    onChange={(decision) =>
                      updateDraft(activeDraft.bookmarkId, {
                        decision,
                        included: decision !== "keep",
                      })
                    }
                  />

                  {activeDraft.decision !== "keep" ? (
                    <div className="space-y-3">
                      {orbitReviewDecisionUsesTags(activeDraft.decision) ? (
                        <div>
                          <div className={cn("mb-1.5 flex items-center gap-1.5", t.label)}>
                            <Tags className="size-3" />
                            Tags
                          </div>
                          <OrbitReviewTagField
                            tagNames={activeDraft.tagNames}
                            included
                            existingTags={sessionArgs.existingTags}
                            onTagNamesChange={(tagNames) =>
                              updateDraft(activeDraft.bookmarkId, { tagNames })
                            }
                          />
                        </div>
                      ) : null}
                      {orbitReviewDecisionUsesCollection(activeDraft.decision) ? (
                        <div>
                          <div className={cn("mb-1.5 flex items-center gap-1.5", t.label)}>
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
                            existingCollections={sessionArgs.existingCollections}
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
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() =>
                        handleAcceptOrbitSuggestion(activeDraft.bookmarkId)
                      }
                      disabled={applying}
                    >
                      <Sparkles className="size-3.5" />
                      Use Orbit suggestion
                    </Button>
                    {activeHasChanges ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-xs text-muted-foreground"
                        onClick={() => handleResetOne(activeDraft.bookmarkId)}
                        disabled={applying}
                      >
                        <RotateCcw className="size-3.5" />
                        Reset
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Compact queue */}
                {effectiveDrafts.length > 1 ? (
                  <div className="mt-4">
                    <div className={cn("mb-2", t.label, "font-semibold")}>
                      Queue
                    </div>
                    <div className="scrollbar-native max-h-36 overflow-y-auto border-t border-hairline-soft">
                      <div>
                        {effectiveDrafts.map((draft, index) => {
                          const bookmark =
                            sessionArgs.bookmarks.find(
                              (b) => b.id === draft.bookmarkId
                            ) ?? null;
                          const selected =
                            draft.bookmarkId === activeDraft.bookmarkId;
                          const impact = getDraftAppliedImpact(draft);

                          return (
                            <button
                              key={draft.bookmarkId}
                              type="button"
                              onClick={() => selectDraft(draft.bookmarkId)}
                              className={cn(
                                "w-full border-b border-hairline-soft px-2 py-2 text-left transition-colors",
                                selected ? "state-selected" : "hover:bg-hover"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-xs font-medium text-foreground">
                                  {bookmark
                                    ? bookmark.authorDisplayName ||
                                      bookmark.authorUsername
                                    : "Bookmark"}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                  {index + 1}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                                <span className="text-muted-foreground">
                                  {getDecisionLabel(draft.decision)}
                                </span>
                                {draftHasChanges(draft) ? (
                                  <span className="text-warning">edited</span>
                                ) : null}
                              </div>
                              <OrbitReviewQueueProposalChips
                                tagNames={impact.tagNames}
                                collectionName={impact.collectionName}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Sticky actions */}
              <div className="shrink-0 space-y-2 border-t border-hairline-soft px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs"
                    onClick={() => void handleKeepCurrent()}
                    disabled={applying}
                  >
                    Keep in Orbit
                  </Button>
                  <Button
                    type="button"
                    className="h-9 gap-1.5 text-xs"
                    onClick={() => void handleApplyCurrent()}
                    disabled={applying}
                  >
                    {applying ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    Apply this item
                  </Button>
                </div>
                {canApplyAll ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    onClick={() => void handleApplyAll()}
                    disabled={applying}
                  >
                    Approve all ({effectiveDrafts.length})
                  </Button>
                ) : null}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Create new collections
                  </span>
                  <Switch
                    checked={createCollections}
                    onCheckedChange={setCreateCollections}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  J/K move · A accept · S skip · Enter apply edits
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            {plan
              ? "No suggestions are waiting for review."
              : "Orbit is preparing suggestions for this review."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompletionMetric({ label, value }: { label: string; value: number }) {
  const t = useTypography();

  return (
    <div className="flex flex-col px-2">
      <dt className={cn("order-2 mt-1", t.label)}>
        {label}
      </dt>
      <dd className="order-1 heading-font text-xl font-bold tabular-nums text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
