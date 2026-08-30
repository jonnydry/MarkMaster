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
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  Tags,
} from "lucide-react";

import {
  BookmarkOverlayAuthorHeader,
  BookmarkOverlayPostColumn,
} from "@/components/bookmark-overlay/bookmark-overlay-primitives";
import { GrokMark } from "@/components/brands/grok-mark";
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
  const [batchOpen, setBatchOpen] = useState(true);
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
          Review Grok suggestions with full bookmark context.
        </DialogDescription>

        {completion ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-5 sm:p-8">
            <div className="w-full max-w-xl surface-solid p-5 text-center sm:p-7">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-success/25 bg-success/10 text-success">
                <CheckCircle2 className="size-6" aria-hidden="true" />
              </span>
              <p className="mt-4 text-2xs font-semibold uppercase tracking-[0.14em] text-primary">
                Organization Sprint
              </p>
              <h2 className="mt-1 heading-font text-2xl font-bold text-foreground">
                Sprint complete
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                You reviewed {completion.reviewedCount} bookmark
                {completion.reviewedCount === 1 ? "" : "s"}. Your library is clearer,
                and the next resurfacing mix can use these decisions.
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  className={buttonVariants({ variant: "highlight" })}
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
                      <span className={cn("inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-0.5", t.label, "font-semibold text-primary")}>
                        <OrbitLogoMark className="size-3" aria-hidden="true" />
                        {title}
                      </span>
                      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {activePositionLabel}
                      </span>
                      {activeOriginal?.confidence ? (
                        <span className={cn("rounded-sm border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5", t.label, "text-emerald-500")}>
                          {confidenceLabel(activeOriginal.confidence)}
                        </span>
                      ) : null}
                      {activeHasChanges ? (
                        <span className="text-2xs text-amber-500">Edited</span>
                      ) : null}
                    </>
                  }
                />
              }
            />

            {/* Review sidebar */}
            <aside className="flex min-h-0 flex-col border-t border-hairline-soft bg-surface-2/45 supports-[backdrop-filter]:backdrop-blur-xl lg:border-l lg:border-t-0">
              <div className="scrollbar-native min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {/* Collapsed batch summary */}
                {plan && effectiveDrafts.length > 1 ? (
                  <div className="mb-4 surface-veil">
                    <button
                      type="button"
                      onClick={() => setBatchOpen((v) => !v)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      aria-expanded={batchOpen}
                    >
                      {batchOpen ? (
                        <ChevronDown className="size-3.5 shrink-0 text-primary/70" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-primary/70" />
                      )}
                      <ListChecks className="size-3.5 shrink-0 text-primary/70" />
                      <span className={cn(t.label, "font-semibold")}>
                        Batch
                      </span>
                      <span className="ml-auto font-mono text-2xs tabular-nums text-muted-foreground">
                        {plan.summary.bookmarksWithTags} tagged ·{" "}
                        {plan.summary.bookmarksWithCollections} collected
                      </span>
                    </button>
                    {batchOpen ? (
                      <div className="border-t border-hairline-soft px-3 pb-3 pt-2">
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <div className="surface-inset px-1 py-1.5">
                            <div className="text-sm font-semibold text-foreground">
                              {plan.summary.bookmarkCount}
                            </div>
                            <div className={t.label}>
                              suggested
                            </div>
                          </div>
                          <div className="surface-inset px-1 py-1.5">
                            <div className="text-sm font-semibold text-foreground">
                              {plan.summary.bookmarksWithTags}
                            </div>
                            <div className={t.label}>
                              tagged
                            </div>
                          </div>
                          <div className="surface-inset px-1 py-1.5">
                            <div className="text-sm font-semibold text-foreground">
                              {plan.summary.bookmarksWithCollections}
                            </div>
                            <div className={t.label}>
                              collected
                            </div>
                          </div>
                        </div>
                        <OrbitReviewBatchImpactChips
                          tagNames={batchImpactSummary.tagNames}
                          collectionNames={batchImpactSummary.collectionNames}
                          className="mt-2"
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

                {/* Grok suggestion */}
                <div className="rounded-sm border border-primary/20 bg-primary/[0.07] p-3">
                  <div className={cn("flex items-center gap-2", t.label, "font-semibold text-primary/80")}>
                    <GrokMark className="size-3.5" />
                    Grok suggestion
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
                  <div className="mt-3 surface-inset px-2.5 py-2">
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
                      Use Grok suggestion
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
                    <div className="scrollbar-native max-h-36 overflow-y-auto">
                      <div className="space-y-1.5 pr-2">
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
                                "w-full rounded-sm border p-2 text-left transition-colors",
                                selected
                                  ? "border-primary/45 bg-primary/10"
                                  : "border-hairline-soft bg-surface-1/55 hover:border-primary/25"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-xs font-medium text-foreground">
                                  {bookmark
                                    ? bookmark.authorDisplayName ||
                                      bookmark.authorUsername
                                    : "Bookmark"}
                                </span>
                                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                                  {index + 1}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="surface-inset-strong px-1 py-0.5 text-2xs text-muted-foreground">
                                  {getDecisionLabel(draft.decision)}
                                </span>
                                {draftHasChanges(draft) ? (
                                  <span className="text-2xs text-amber-500">
                                    edited
                                  </span>
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
              <div className="shrink-0 space-y-2 border-t border-hairline-soft bg-background/80 px-4 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs"
                    onClick={() => void handleKeepCurrent()}
                    disabled={applying}
                  >
                    <OrbitLogoMark className="size-3.5" />
                    Keep in Orbit
                  </Button>
                  <Button
                    type="button"
                    className="h-9 gap-1.5 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
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
                    variant="secondary"
                    className="h-9 w-full gap-1.5 text-xs"
                    onClick={() => void handleApplyAll()}
                    disabled={applying}
                  >
                    Approve all ({effectiveDrafts.length})
                  </Button>
                ) : null}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-2xs text-muted-foreground">
                    Create new collections
                  </span>
                  <Switch
                    checked={createCollections}
                    onCheckedChange={setCreateCollections}
                  />
                </div>
                <p className="text-center text-2xs text-muted-foreground/70">
                  J/K move · S use suggestion · A apply · X keep
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            {plan
              ? "No suggestions are waiting for review."
              : "Grok is preparing suggestions for this review."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompletionMetric({ label, value }: { label: string; value: number }) {
  const t = useTypography();

  return (
    <div className="flex flex-col surface-inset-strong px-2 py-3">
      <dt className={cn("order-2 mt-1", t.label)}>
        {label}
      </dt>
      <dd className="order-1 heading-font text-xl font-bold tabular-nums text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
