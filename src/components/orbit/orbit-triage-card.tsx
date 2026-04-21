"use client";

import { useMemo } from "react";
import { Folder, Loader2, Sparkles, Tag as TagIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BookmarkCard } from "@/components/bookmark-card";
import { confidencePercent, formatConfidence } from "@/lib/orbit-decision";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  OrbitBookmarkDecision,
  OrbitDecision,
  ViewMode,
} from "@/types";

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
  onApplyPrimary?: (bookmarkId: string) => void;
  onApplyAlternative?: (bookmarkId: string) => void;
  onKeepInOrbit?: (bookmarkId: string) => void;
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
  onApplyPrimary,
  onApplyAlternative,
  onKeepInOrbit,
  className,
}: OrbitTriageCardProps) {
  const primary = decision?.primary ?? null;
  const alternative = decision?.alternative ?? null;
  const confidencePct = decision ? confidencePercent(decision.confidence) : null;

  const confidenceTone = useMemo(() => {
    if (!decision) return "";
    switch (decision.confidence) {
      case "high":
        return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
      case "medium":
        return "border-sky-400/30 bg-sky-400/10 text-sky-100";
      case "low":
        return "border-amber-400/30 bg-amber-400/10 text-amber-100";
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

      {decision && (
        <div className="relative flex flex-col gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(10,15,29,0.85))] px-4 py-3 rounded-b-2xl sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <span
              className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80"
              style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
            >
              Primary suggestion
            </span>
            {confidencePct !== null && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                  confidenceTone
                )}
                title={formatConfidence(decision.confidence)}
              >
                {confidencePct}% confidence
              </span>
            )}
          </div>

          {primary ? (
            <>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-white/10 text-sky-200">
                  {primary.kind === "collection" ? (
                    <Folder className="size-3.5" />
                  ) : (
                    <TagIcon className="size-3.5" />
                  )}
                </span>
                <p className="text-sm font-medium leading-tight text-white">
                  {describeMove(primary)}
                  {primary.reuseExisting && (
                    <span className="ml-2 text-[10px] font-normal uppercase tracking-[0.18em] text-white/55">
                      existing
                    </span>
                  )}
                </p>
              </div>

              {decision.reasoning && (
                <p className="text-xs leading-snug text-white/65">
                  {decision.reasoning}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
                  disabled={applying}
                  onClick={() => onApplyPrimary?.(bookmark.id)}
                >
                  {applying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Apply
                </Button>
                {alternative && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-white/15 bg-white/5 text-white hover:bg-white/10"
                    disabled={applying}
                    onClick={() => onApplyAlternative?.(bookmark.id)}
                  >
                    {alternative.kind === "collection" ? (
                      <Folder className="size-3.5" />
                    ) : (
                      <TagIcon className="size-3.5" />
                    )}
                    {alternative.kind === "collection"
                      ? alternative.label
                      : `Tag as ${alternative.label}`}
                  </Button>
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
