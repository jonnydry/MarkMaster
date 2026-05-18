"use client";

import { useState } from "react";
import { RotateCcw, ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import {
  OrbitReviewTagField,
  OrbitReviewCollectionField,
  OrbitReviewDecisionControl,
  getDecisionLabel,
} from "@/components/orbit/orbit-review-fields";

import { cn } from "@/lib/utils";
import { confidenceLabel, formatConfidence } from "@/lib/orbit-decision";
import type {
  BookmarkWithRelations,
  CollectionWithCount,
  OrbitBookmarkSuggestion,
  TagWithCount,
} from "@/types";
import {
  deriveReviewDecision,
  orbitReviewDecisionUsesCollection,
  orbitReviewDecisionUsesTags,
  splitTagNames,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

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
}: OrbitReviewEditSheetProps) {
  const [reasoningOpen, setReasoningOpen] = useState(true);

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
        className="w-full max-w-[440px] border-l border-white/10 bg-slate-950 p-0 text-white shadow-2xl"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                @{bookmark?.authorUsername ?? draft.bookmarkId}
                {original && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                      original.confidence === "high" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                      original.confidence === "medium" && "border-sky-400/30 bg-sky-400/10 text-sky-200",
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
              <SheetClose className="rounded p-1 hover:bg-white/10" />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="space-y-6 p-5">
              {/* Full Grok Reasoning */}
              <div>
                <button
                  onClick={() => setReasoningOpen(!reasoningOpen)}
                  className="flex w-full items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 hover:text-white/70"
                  style={MONO_STYLE}
                >
                  Why Grok suggested this
                  {reasoningOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>

                {reasoningOpen && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-snug text-white/75">
                    {original?.reasoning || "No detailed reasoning provided."}
                  </div>
                )}
              </div>

              {/* Premium Diff Block */}
              {original && hasChanges && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
                      Grok original → Your edits
                    </div>
                    <span className="rounded bg-amber-400/15 px-1.5 py-px text-[10px] text-amber-300">Edited</span>
                  </div>

                  <div className="space-y-2 text-xs text-white/75">
                    {/* Decision */}
                    {(() => {
                      const origDec = getDecisionLabel(deriveReviewDecision(original));
                      const currDec = getDecisionLabel(draft.decision);
                      if (origDec === currDec) return null;
                      return <div>Decision: <span className="text-white/50 line-through">{origDec}</span> → <span className="font-medium text-amber-300">{currDec}</span></div>;
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
                      return <div>Collection: <span className="text-white/50">{origC}</span> → <span className="font-medium text-amber-300">{currC}</span></div>;
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

              {/* Decision */}
              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
                  Decision
                </div>
                <OrbitReviewDecisionControl
                  value={draft.decision}
                  onChange={(d) => update({ decision: d, included: d !== "keep" })}
                />
              </div>

              {/* Tags */}
              {orbitReviewDecisionUsesTags(draft.decision) && (
                <div>
                  <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
                    Tags
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
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
                  <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50" style={MONO_STYLE}>
                    Collection
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
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
          <div className="border-t border-white/10 p-4 text-[10px] text-white/40">
            Esc closes • Tab to fields
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
