"use client";

import { useState } from "react";
import { RotateCcw, ChevronDown, ChevronRight } from "lucide-react";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import {
  OrbitReviewTagField,
  OrbitReviewCollectionField,
  OrbitReviewDecisionControl,
  getDecisionLabel,
} from "@/components/orbit/orbit-review-fields";

import { orbital } from "@/components/orbital";
import { useOrbitalTheme } from "@/components/providers";
import { reviewChrome } from "@/lib/orbit-review-chrome";
import { cn } from "@/lib/utils";
import { confidenceLabel } from "@/lib/orbit-decision";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitBookmarkSuggestion,
  TagWithCount,
} from "@/types";
import {
  deriveReviewDecision,
  getQuickSmartPatch,
  orbitReviewDecisionUsesCollection,
  orbitReviewDecisionUsesTags,
  splitTagNames,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import type { AuthorDecisionHistory } from "@/lib/orbit-author-history";
import type {
  SimilarCollections,
  SimilarCollectionItem,
} from "@/lib/orbit-similar-collections";

function sectionLabelClass(isOrbital: boolean) {
  return cn(
    isOrbital ? orbital.label : "text-[10px] font-medium uppercase tracking-[0.18em] text-white/50",
    "normal-case tracking-[0.18em]"
  );
}

// Truncation constants for the "Other high-performers..." panel preview text.
// Keeps the list dense while showing enough of the tweet to be recognizable.
const SIMILAR_PREVIEW_MAX_CHARS = 72;
const SIMILAR_PREVIEW_SLICE_CHARS = 69;

interface OrbitReviewEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: OrbitReviewSuggestionDraft | null;
  original: OrbitBookmarkSuggestion | null;
  bookmark: BookmarkWithRelations | null;
  existingTags: TagWithCount[];
  existingCollections: CollectionWithCount[];
  onDraftChange: (bookmarkId: string, patch: Partial<OrbitReviewSuggestionDraft>) => void;
  onReset: (bookmarkId: string) => void;
  authorHistory?: AuthorDecisionHistory;
  similarCollections?: SimilarCollections;
  reviewMode?: "quick" | "deep";
  /** Controls default open/locked state for the three heavy panels (resets on new reviewSessionId). */
  reviewSessionId?: number;
}

export function OrbitReviewEditSheet({
  open,
  onOpenChange,
  draft,
  original,
  bookmark,
  existingTags,
  existingCollections,
  onDraftChange,
  onReset,
  authorHistory = null,
  similarCollections = null,
  reviewMode = "deep",
  reviewSessionId = 0,
}: OrbitReviewEditSheetProps) {
  const { isOrbital } = useOrbitalTheme();
  const rcx = reviewChrome(isOrbital);
  const labelClass = sectionLabelClass(isOrbital);
  const isQuick = reviewMode === "quick";
  // Panel UI state (opens + locks) is keyed by reviewSessionId using the exact same
  // pattern as draftState/createCollectionsState in the parent dialog. This guarantees
  // fresh unlocked + mode-derived defaults for every new review session (when parent
  // bumps reviewSessionId on "Review all" or per-bookmark review start, and on close/reopen).
  // Within one session, manual locks persist across mode flips and across different
  // bookmarks' "Details" sheets (until the user interacts with a given panel).
  // No setState-in-effect; derivation + key check handles reset. Lint-safe.
  const [panelUIState, setPanelUIState] = useState<{
    key: number;
    locked: { reasoning: boolean; authorHistory: boolean; similar: boolean };
    open: { reasoning: boolean; authorHistory: boolean; similar: boolean };
  }>(() => ({
    key: -1,
    locked: { reasoning: false, authorHistory: false, similar: false },
    open: { reasoning: true, authorHistory: true, similar: true },
  }));

  const isCurrentSession = panelUIState.key === reviewSessionId;
  const locked = isCurrentSession
    ? panelUIState.locked
    : { reasoning: false, authorHistory: false, similar: false };
  const openVals = isCurrentSession
    ? panelUIState.open
    : { reasoning: true, authorHistory: true, similar: true };

  const effectiveReasoningOpen = locked.reasoning
    ? openVals.reasoning
    : reviewMode === "deep";
  const effectiveAuthorHistoryOpen = locked.authorHistory
    ? openVals.authorHistory
    : reviewMode === "deep";
  const effectiveSimilarOpen = locked.similar
    ? openVals.similar
    : reviewMode === "deep";

  const updatePanel = (
    name: "reasoning" | "authorHistory" | "similar",
    nextOpen: boolean
  ) => {
    const currKey = reviewSessionId;
    const currLocked = isCurrentSession ? panelUIState.locked : { reasoning: false, authorHistory: false, similar: false };
    const currOpen = isCurrentSession ? panelUIState.open : { reasoning: true, authorHistory: true, similar: true };
    setPanelUIState({
      key: currKey,
      locked: { ...currLocked, [name]: true },
      open: { ...currOpen, [name]: nextOpen },
    });
  };

  if (!draft) return null;

  const update = (patch: Partial<OrbitReviewSuggestionDraft>) =>
    onDraftChange(draft.bookmarkId, patch);

  const hasChanges =
    original &&
    (draft.decision !== deriveReviewDecision(original) ||
      (() => {
        const o = new Set(original.tags.map((t) => t.name));
        const c = new Set(splitTagNames(draft.tagNames));
        return o.size !== c.size || [...o].some((x) => !c.has(x));
      })() ||
      draft.collectionName !== (original.collection?.name || ""));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-full max-w-[440px] border-l p-0 shadow-2xl", rcx.sheetShell)}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className={cn("flex items-center justify-between border-b px-4 py-3", rcx.headerBorder)}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                @{bookmark?.authorUsername ?? draft.bookmarkId}
                {original && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                      original.confidence === "high" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                      original.confidence === "medium" && "border-primary/30 bg-primary/10 text-primary/80",
                      original.confidence === "low" && "border-blue-500/30 bg-blue-500/10 text-blue-200"
                    )}
                  >
                    {confidenceLabel(original.confidence).split(" ")[0]}
                  </span>
                )}
                {hasChanges && (
                  <span className="rounded bg-amber-400/15 px-1.5 py-px text-[10px] text-amber-300">edited</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReset(draft.bookmarkId)}
                className="h-8 gap-1.5 text-xs"
              >
                <RotateCcw className="size-3.5" /> Reset
              </Button>
              <SheetClose
                className={cn(
                  "rounded p-1",
                  isOrbital ? "hover:bg-accent-soft" : "hover:bg-white/10"
                )}
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className={cn("space-y-6 p-5", isQuick && "space-y-3 p-4")}>
              {bookmark ? (
                <BookmarkPostPreview
                  tweetText={bookmark.tweetText}
                  authorUsername={bookmark.authorUsername}
                  media={bookmark.media}
                  tweetLink={{
                    authorUsername: bookmark.authorUsername,
                    tweetId: bookmark.tweetId,
                  }}
                  bookmarkKey={bookmark.id}
                  variant="inline"
                  textClassName={cn(
                    "text-sm leading-relaxed whitespace-pre-wrap",
                    rcx.bodyDim
                  )}
                  galleryClassName="!mt-2"
                />
              ) : null}

              {/* Full Grok Reasoning */}
              <div>
                <button
                  // Lock + invert the *current render's effective* value (mode default if first click)
                  // so the manual choice is captured against what the user actually saw.
                  onClick={() => updatePanel("reasoning", !effectiveReasoningOpen)}
                  className={cn(labelClass, "flex w-full items-center gap-1.5", rcx.collapsibleBtn)}
                >
                  Why Grok suggested this
                  {effectiveReasoningOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>

                {effectiveReasoningOpen && (
                  <div className={cn("mt-2 p-4 text-sm leading-snug", rcx.panel, rcx.bodyDim)}>
                    {original?.reasoning || "No detailed reasoning provided."}
                  </div>
                )}
              </div>

              {/* Premium Diff Block */}
              {original && hasChanges && (
                <div className={cn("p-4", rcx.card)}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className={cn(labelClass, "flex items-center gap-2", rcx.soft)}>
                      Grok original → Your edits
                    </div>
                    <span className="rounded bg-amber-400/15 px-1.5 py-px text-[10px] text-amber-300">Edited</span>
                  </div>

                  <div className={cn("space-y-2 text-xs", rcx.bodyDim)}>
                    {/* Decision */}
                    {(() => {
                      const origDec = getDecisionLabel(deriveReviewDecision(original));
                      const currDec = getDecisionLabel(draft.decision);
                      if (origDec === currDec) return null;
                      return <div>Decision: <span className={cn(rcx.soft, "line-through")}>{origDec}</span> → <span className="font-medium text-amber-300">{currDec}</span></div>;
                    })()}

                    {/* Tags */}
                    {(() => {
                      const origTags = original.tags.map((t) => t.name);
                      const currTags = splitTagNames(draft.tagNames);
                      const added = currTags.filter((t) => !origTags.includes(t));
                      const removed = origTags.filter((t) => !currTags.includes(t));
                      if (added.length === 0 && removed.length === 0) return null;
                      return (
                        <div>
                          Tags:
                          {removed.length > 0 && <span className="text-rose-400"> −{removed.join(", ")}</span>}
                          {added.length > 0 && <span className="text-emerald-400"> +{added.join(", ")}</span>}
                        </div>
                      );
                    })()}

                    {/* Collection */}
                    {(() => {
                      const origC = original.collection?.name || "—";
                      const currC = draft.collectionName.trim() || "—";
                      if (origC === currC) return null;
                      return <div>Collection: <span className={rcx.soft}>{origC}</span> → <span className="font-medium text-amber-300">{currC}</span></div>;
                    })()}
                  </div>
                </div>
              )}

              {/* No changes state */}
              {original && !hasChanges && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-[11px] text-emerald-200/90">
                  Matches Grok’s original suggestion exactly
                </div>
              )}

              {/* Author decision history panel — now powered by real cross-library
                  historical decisions (tags + user collections applied to prior bookmarks
                  by the same author). Shows while loading (graceful) or when high-signal
                  history exists. Keeps exact same collapsible UI, placement, and styling. */}
              {authorHistory &&
                ("loading" in authorHistory ||
                  (authorHistory.priorCount > 0 &&
                    (authorHistory.tags.length > 0 || authorHistory.collections.length > 0))) && (
                <div>
                  <button
                    // Lock + invert the *current render's effective* value (mode default if first click)
                    // so the manual choice is captured against what the user actually saw.
                    onClick={() => updatePanel("authorHistory", !effectiveAuthorHistoryOpen)}
                    className={cn(labelClass, "flex w-full items-center gap-1.5", rcx.collapsibleBtn)}
                  >
                    Your past decisions on @{authorHistory.authorUsername}
                    {effectiveAuthorHistoryOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  </button>

                  {effectiveAuthorHistoryOpen && (
                    <div className={cn("mt-2 p-3 text-[11px]", rcx.panel, rcx.bodyDim)}>
                      {"loading" in authorHistory ? (
                        <div className={rcx.soft}>Loading your past decisions for this author…</div>
                      ) : (
                        <div className="space-y-1">
                          {authorHistory.tags.length > 0 && (
                            <div>
                              <span className={rcx.soft}>Tags: </span>
                              <span className="text-emerald-300">{authorHistory.tags.join(", ")}</span>
                            </div>
                          )}
                          {authorHistory.collections.length > 0 && (
                            <div>
                              <span className={rcx.soft}>Collections: </span>
                              <span className="text-primary">{authorHistory.collections.join(", ")}</span>
                            </div>
                          )}
                          <div className={cn("pt-0.5 text-[10px]", rcx.soft)}>
                            from {authorHistory.priorCount} bookmark{authorHistory.priorCount === 1 ? "" : "s"} by this author in your library
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Other high-performers in similar collections panel — powered by real
                  cross-library data (Phase 3 Item 9 Slice 3). Shows performance-weighted
                  overlaps on collections (primary) or tags, with overlap explanation.
                  Same collapsible MONO styling, placement, loading/empty handling as
                  author panel. Only rendered when high-signal results exist. */}
              {similarCollections &&
                ("loading" in similarCollections ||
                  (Array.isArray(similarCollections) && similarCollections.length > 0)) && (
                <div>
                  <button
                    // Lock + invert the *current render's effective* value (mode default if first click)
                    // so the manual choice is captured against what the user actually saw.
                    onClick={() => updatePanel("similar", !effectiveSimilarOpen)}
                    className={cn(labelClass, "flex w-full items-center gap-1.5", rcx.collapsibleBtn)}
                  >
                    Other high-performers in similar collections
                    {effectiveSimilarOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  </button>

                  {effectiveSimilarOpen && (
                    <div className={cn("mt-2 p-3 text-[11px]", rcx.panel, rcx.bodyDim)}>
                      {"loading" in similarCollections ? (
                        <div className={rcx.soft}>Loading other high-performers in similar collections…</div>
                      ) : (
                        <div className="space-y-2">
                          {(similarCollections as SimilarCollectionItem[]).map((item) => (
                            <div key={item.bookmarkId}>
                              <div className={rcx.body}>
                                @{item.authorUsername}:{" "}
                                {/* Slice 2: more aggressive truncation in Quick Pass while preserving original consts for Deep Review */}
                                {item.tweetText.length > (isQuick ? 50 : SIMILAR_PREVIEW_MAX_CHARS)
                                  ? item.tweetText.slice(0, (isQuick ? 47 : SIMILAR_PREVIEW_SLICE_CHARS)) + "…"
                                  : item.tweetText}
                              </div>
                              <div className="text-[10px] text-white/50">
                                {item.sharedCollections.length > 0 && (
                                  <span>
                                    Collections: <span className="text-primary">{item.sharedCollections.join(", ")}</span>
                                  </span>
                                )}
                                {item.sharedCollections.length > 0 && item.sharedTags.length > 0 && " • "}
                                {item.sharedTags.length > 0 && (
                                  <span>
                                    Tags: <span className="text-emerald-300">{item.sharedTags.join(", ")}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Decision */}
              <div>
                <div className={cn(labelClass, "mb-1.5 flex items-center", rcx.soft)}>
                  Decision
                  {/* Slice 3: tiny non-intrusive "why smart" note in Quick Pass sheet.
                      Uses native title tooltip (subtle floating, zero visual noise until hover).
                      Explains source only when real history/similar data is present (i.e. after opening
                      this item's Details at least once). Does not auto-apply; only documents that the
                      Accept Orbit suggestion button (in list) may have used these signals. */}
                  {isQuick && (() => {
                    const realHist = authorHistory && !("loading" in authorHistory) ? authorHistory : null;
                    const realSim = Array.isArray(similarCollections) ? similarCollections : null;
                    const hasSignal = !!(realHist || realSim);
                    if (!hasSignal || !original) return null;
                    // Actually invoke the helper (ensures import is used; determines if a true smart enhancement exists)
                    const smartPatch = getQuickSmartPatch(original, realHist, realSim);
                    // Show the note only when helper produced a patch that actually differs from plain original (real smarts applied or available)
                    const baseDecision = deriveReviewDecision(original);
                    const baseTags = original.tags.map((t) => t.name).join(", ");
                    const baseCol = original.collection?.name ?? "";
                    const isEnhanced =
                      smartPatch &&
                      (smartPatch.decision !== baseDecision ||
                        smartPatch.tagNames !== baseTags ||
                        smartPatch.collectionName !== baseCol);
                    if (!isEnhanced) return null;
                    const sp = smartPatch!;
                    const draftMatchesSmart =
                      draft.decision === sp.decision &&
                      (draft.tagNames ?? "") === (sp.tagNames ?? "") &&
                      (draft.collectionName ?? "") === (sp.collectionName ?? "");
                    if (!draftMatchesSmart) return null;
                    const prior = (realHist as { priorCount?: number } | null)?.priorCount ?? 0;
                    const username = (realHist as { authorUsername?: string } | null)?.authorUsername ?? "";
                    const why = [
                      realHist ? `your ${prior} prior decision${prior === 1 ? "" : "s"} on @${username}` : "",
                      realSim ? "similar high-performers" : "",
                    ].filter(Boolean).join(" + ");
                    return (
                      <span
                        className="ml-1.5 normal-case tracking-normal text-emerald-300/60 text-[9px]"
                        title={`Smart suggestion source: ${why}. Values derived client-side by getQuickSmartPatch (conservative history-aware patch) and reflected in your current draft.`}
                      >
                        from your history
                      </span>
                    );
                  })()}
                </div>
                {isQuick ? (
                  <div className={rcx.quickDecisionShell}>
                    <OrbitReviewDecisionControl
                      value={draft.decision}
                      onChange={(d) => update({ decision: d, included: d !== "keep" })}
                    />
                  </div>
                ) : (
                  <OrbitReviewDecisionControl
                    value={draft.decision}
                    onChange={(d) => update({ decision: d, included: d !== "keep" })}
                  />
                )}
              </div>

              {/* Tags */}
              {orbitReviewDecisionUsesTags(draft.decision) && (
                <div>
                  <div className={cn(labelClass, "mb-1.5", rcx.soft)}>
                    Tags
                  </div>
                  <div className={rcx.fieldShell}>
                    <OrbitReviewTagField
                      tagNames={draft.tagNames}
                      included={true}
                      existingTags={existingTags}
                      onTagNamesChange={(n) => update({ tagNames: n })}
                    />
                  </div>
                </div>
              )}

              {/* Collection */}
              {orbitReviewDecisionUsesCollection(draft.decision) && (
                <div>
                  <div className={cn(labelClass, "mb-1.5", rcx.soft)}>
                    Collection
                  </div>
                  <div className={rcx.fieldShell}>
                    <OrbitReviewCollectionField
                      collectionName={draft.collectionName}
                      collectionDescription={draft.collectionDescription}
                      included={true}
                      namePlaceholder="No collection move"
                      existingCollections={existingCollections}
                      onCollectionNameChange={(n) => update({ collectionName: n })}
                      onCollectionDescriptionChange={(d) => update({ collectionDescription: d })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className={cn("border-t p-4 text-[10px]", rcx.footer)}>
            Esc closes • Tab to fields
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
