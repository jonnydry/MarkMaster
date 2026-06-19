"use client";

import { useState } from "react";
import Image from "next/image";
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
  X,
} from "lucide-react";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { XLogoMark } from "@/components/brands/x-logo-mark";
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
import { confidenceLabel } from "@/lib/orbit-decision";
import { formatPostDate } from "@/lib/format-metrics";
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

function getAuthorLabel(
  bookmark: NonNullable<ReturnType<typeof useOrbitReviewSession>["activeBookmark"]>
): string {
  return bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
}

export function OrbitReviewOverlay({
  applying,
  onActiveBookmarkChange,
  ...sessionArgs
}: OrbitReviewOverlayProps) {
  const { open, onOpenChange } = sessionArgs;
  const session = useOrbitReviewSession(sessionArgs);
  const [batchOpen, setBatchOpen] = useState(true);

  const {
    title,
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

        {activeBookmark && activeDraft ? (
          <div
            data-orbit-review-overlay
            className={appOverlayDialogGridReviewClassName}
          >
            {/* Full post — same shell as OrbitBookmarkOverlay */}
            <div className="scrollbar-native min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-start gap-3">
                {activeBookmark.authorProfileImage ? (
                  <Image
                    src={activeBookmark.authorProfileImage}
                    alt={`${activeBookmark.authorDisplayName} avatar`}
                    width={44}
                    height={44}
                    sizes="44px"
                    className="h-11 w-11 shrink-0 rounded-full"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                    {getAuthorLabel(activeBookmark).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-base font-semibold text-foreground">
                      {getAuthorLabel(activeBookmark)}
                    </span>
                    {activeBookmark.authorUsername ? (
                      <span className="text-sm text-muted-foreground">
                        @{activeBookmark.authorUsername}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatPostDate(activeBookmark.tweetCreatedAt)}
                    </span>
                    <XLogoMark
                      className="h-3.5 w-3.5 text-muted-foreground/60"
                      title="Post from X"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-primary">
                      <OrbitLogoMark className="size-3" aria-hidden="true" />
                      {title}
                    </span>
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {activePositionLabel}
                    </span>
                    {activeOriginal?.confidence ? (
                      <span className="rounded-sm border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em] text-emerald-500">
                        {confidenceLabel(activeOriginal.confidence)}
                      </span>
                    ) : null}
                    {activeHasChanges ? (
                      <span className="text-2xs text-amber-500">Edited</span>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close review"
                  className="surface-inset-strong text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>

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

              {activeBookmark.quotedTweet ? (
                <div className="mt-4 surface-inset p-3">
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
            </div>

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
                      <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                            <div className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">
                              suggested
                            </div>
                          </div>
                          <div className="surface-inset px-1 py-1.5">
                            <div className="text-sm font-semibold text-foreground">
                              {plan.summary.bookmarksWithTags}
                            </div>
                            <div className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">
                              tagged
                            </div>
                          </div>
                          <div className="surface-inset px-1 py-1.5">
                            <div className="text-sm font-semibold text-foreground">
                              {plan.summary.bookmarksWithCollections}
                            </div>
                            <div className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">
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
                      size="icon-sm"
                      variant="outline"
                      className="h-8 w-8 border-hairline-strong"
                      onClick={() => moveActiveDraft(-1)}
                      disabled={session.activeDraftIndex <= 0}
                      aria-label="Previous item"
                    >
                      <ArrowLeft className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      className="h-8 w-8 border-hairline-strong"
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
                  <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.08em] text-primary/80">
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
                          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                    <div className="mb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
