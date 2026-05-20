"use client";

import { useMemo } from "react";
import { Folder, Loader2, Tag as TagIcon } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { BookmarkCard } from "@/components/bookmark-card";
import { confidenceLabel, formatConfidence } from "@/lib/orbit-decision";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  OrbitBookmarkDecision,
  OrbitDecision,
  ViewMode,
} from "@/types";

import { orbital } from "@/components/orbital";

interface OrbitTriageCardProps {
  bookmark: BookmarkWithRelations;
  viewMode: ViewMode;
  decision: OrbitBookmarkDecision | null;
  selected: boolean;
  selectionMode: boolean;
  applying: boolean;
  searchQuery?: string;
  priorityMedia?: boolean;
  onSelect: (bookmarkId: string) => void;
  onSelectionChange?: (bookmarkId: string, selected: boolean) => void;
  onTagClick?: (tagId: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  onDelete?: (bookmarkId: string) => void;
  onReviewSuggestion?: (bookmarkId: string) => void;
  onApplyAlternative?: (bookmarkId: string) => void;
  onKeepInOrbit?: (bookmarkId: string) => void;
  onFeedback?: (bookmarkId: string, type: 'good' | 'not_relevant') => void; // Phase 2 inline feedback
  className?: string;
}

function describeMove(decision: OrbitDecision): string {
  return decision.kind === "collection"
    ? `Add to ${decision.label}`
    : `Tag as ${decision.label}`;
}

export function OrbitTriageCard({
  bookmark,
  viewMode,
  decision,
  selected,
  selectionMode,
  applying,
  searchQuery,
  priorityMedia,
  onSelect,
  onSelectionChange,
  onTagClick,
  onAddTag,
  onAddToCollection,
  onDelete,
  onReviewSuggestion,
  onApplyAlternative,
  onKeepInOrbit,
  className,
}: OrbitTriageCardProps) {
  const primary = decision?.primary ?? null;
  const alternative = decision?.alternative ?? null;
  const confidenceText = decision ? confidenceLabel(decision.confidence) : null;
  const reasoning = decision?.reasoning;

  const confidenceTone = useMemo(() => {
    if (!decision) return "";
    switch (decision.confidence) {
      case "high":
        return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
      case "medium":
        return "border-primary/40 bg-primary/10 text-primary";
      case "low":
        return "border-bronze/30 bg-bronze/10 text-bronze";
      default:
        return "";
    }
  }, [decision]);

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-hairline-soft bg-surface-1 shadow-sm transition-colors",
        selected && !selectionMode && "border-primary/35 bg-surface-2/60",
        className
      )}
    >
      <BookmarkCard
        bookmark={bookmark}
        viewMode={viewMode}
        searchQuery={searchQuery}
        priorityMedia={priorityMedia}
        selected={selected}
        onSelect={onSelect}
        selectionMode={selectionMode}
        onSelectionChange={onSelectionChange}
        onTagClick={onTagClick}
        onAddTag={onAddTag}
        onAddToCollection={onAddToCollection}
        onDelete={onDelete}
      />

      {/* Phase 1 polish: Make Grok reasoning more prominent in primary triage cards */}
      {decision?.reasoning && (
        <div className="px-4 pb-2 text-[11px] leading-snug text-muted-foreground border-t border-hairline-soft">
          <span className="font-medium text-primary/80">Grok: </span>
          {decision.reasoning}
        </div>
      )}

      {decision && (
        <div className={cn("relative flex flex-col gap-3 border-t border-hairline-soft px-4 py-3", orbital.glass)}>
          <div className="flex items-center justify-between gap-3">
            <span className={cn(orbital.label, "font-medium text-primary/80")}>
              Primary suggestion
            </span>
            {confidenceText !== null && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-mono-data",
                  confidenceTone
                )}
                title={formatConfidence(decision.confidence)}
              >
                {confidenceText}
              </span>
            )}
          </div>

          {primary ? (
            <>
              <div className="flex items-start gap-2">
                <span className={cn("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md", orbital.icon)}>
                  {primary.kind === "collection" ? (
                    <Folder className="size-3.5" />
                  ) : (
                    <TagIcon className="size-3.5" />
                  )}
                </span>
                <p className="text-sm font-medium leading-tight text-white">
                  {describeMove(primary)}
                  {primary.reuseExisting && (
                    <span className={cn(orbital.label, "ml-2 text-white/55")}>
                      existing
                    </span>
                  )}
                </p>
              </div>

              {/* Reasoning now shown prominently above the decision section for better visibility in primary cards */}

              {decision.suggestedTags.length > 0 ? (
                <div>
                  <p className={cn(orbital.label, "mb-1.5 text-white/40")}>
                    All suggested tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {decision.suggestedTags.map((tag, idx) => (
                      <span
                        key={`${tag.name}-${idx}`}
                        className={orbital.pill}
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                          aria-hidden
                        />
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
                  disabled={applying}
                  onClick={() => onReviewSuggestion?.(bookmark.id)}
                >
                  {applying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <GrokMark className="size-3.5" title="Grok" />
                  )}
                  Review
                </Button>
                {alternative && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
                      disabled={applying || !onApplyAlternative}
                      onClick={() => onApplyAlternative?.(bookmark.id)}
                    >
                      {applying ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : alternative.kind === "collection" ? (
                        <Folder className="size-3.5" />
                      ) : (
                        <TagIcon className="size-3.5" />
                      )}
                      {alternative.kind === "collection"
                        ? `Add to ${alternative.label}`
                        : `Tag ${alternative.label}`}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-white/70 hover:bg-white/5 hover:text-white"
                  disabled={applying}
                  onClick={() => onKeepInOrbit?.(bookmark.id)}
                >
                  Keep in Orbit
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-snug text-white/60">
                {decision.reasoning ||
                  "Grok was not confident — keep in Orbit or sort manually."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-white/70 hover:bg-white/5 hover:text-white"
                  disabled={applying}
                  onClick={() => onKeepInOrbit?.(bookmark.id)}
                >
                  Keep in Orbit
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
