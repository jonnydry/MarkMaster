"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { toast } from "sonner";
import {
  addDislikedHighlightId,
  addLikedHighlightId,
  getHighlightFeedback,
  removeDislikedHighlightId,
  removeLikedHighlightId,
} from "@/lib/highlight-feedback";
import type { BookmarkWithRelations } from "@/types";

function formatCompactMetric(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function getHighlightLabel(bookmark: BookmarkWithRelations) {
  const firstTag = bookmark.tags[0]?.tag.name;
  if (bookmark.notes.length > 0) return "Note attached";
  if (bookmark.collectionItems.length > 0) return "In collection";
  if (firstTag) return `#${firstTag}`;
  if (bookmark.media?.length) return "Media save";
  return "Bookmark";
}

function getHighlightMetric(bookmark: BookmarkWithRelations) {
  const metrics = bookmark.publicMetrics;
  if (!metrics) return `@${bookmark.authorUsername}`;
  if (metrics.like_count > 0) return `${formatCompactMetric(metrics.like_count)} likes`;
  if (metrics.retweet_count > 0) return `${formatCompactMetric(metrics.retweet_count)} reposts`;
  if (metrics.reply_count > 0) return `${formatCompactMetric(metrics.reply_count)} replies`;
  return `@${bookmark.authorUsername}`;
}

interface PerformanceHighlightsProps {
  bookmarks: BookmarkWithRelations[];
  total?: number;
  title?: string;
  subtitle?: string;
  activeBookmarkId?: string | null;
  onSelect?: (id: string) => void;
  onFocusForTriage?: (id: string) => void;
  onOrbitReview?: (id: string) => void;
  className?: string;
  isRawMode?: boolean;
  /** Optional per-item labels (e.g. { [bookmarkId]: "Resurfaced" }) for the Digest */
  itemLabels?: Record<string, string>;
}

export function PerformanceHighlights({
  bookmarks,
  total,
  title = "Highlights",
  subtitle,
  activeBookmarkId,
  onSelect,
  onFocusForTriage,
  onOrbitReview,
  className,
  isRawMode = false,
  itemLabels = {},
}: PerformanceHighlightsProps) {
  const [, setFeedbackTick] = useState(0);
  const highlightBookmarks = bookmarks.slice(0, 4);
  if (highlightBookmarks.length === 0) return null;

  const displaySubtitle =
    subtitle ??
    (typeof total === "number"
      ? `${total.toLocaleString()} total`
      : `${bookmarks.length.toLocaleString()} in view`);

  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[960px] px-4 pb-2 pt-2 sm:px-5",
        className
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
          {displaySubtitle}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {highlightBookmarks.map((bookmark, index) => {
          const active = activeBookmarkId === bookmark.id;
          const label = getHighlightLabel(bookmark);
          return (
            <div
              key={bookmark.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelect?.(bookmark.id);
                onFocusForTriage?.(bookmark.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(bookmark.id);
                  onFocusForTriage?.(bookmark.id);
                }
              }}
              className={cn(
                "group flex min-h-[8.5rem] flex-col rounded-sm border bg-surface-1/55 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
                active
                  ? "border-primary/45 bg-accent-soft/60"
                  : "border-hairline-soft hover:border-primary/35 hover:bg-surface-1"
              )}
              aria-label={`Open highlighted bookmark ${index + 1} from ${bookmark.authorDisplayName}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                    {label}
                  </span>
                  {itemLabels[bookmark.id] && (
                    <span
                      className="font-mono text-[9px] px-1.5 py-px rounded bg-amber-400/10 text-amber-200 border border-amber-400/20"
                      title={itemLabels[bookmark.id].includes("Resurfaced") ? "Forgotten high-performer from >30d ago — resurfaced for review" : undefined}
                    >
                      {itemLabels[bookmark.id]}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground/55">
                  #{index + 1}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 font-mono text-sm font-bold leading-5 text-foreground">
                {bookmark.tweetText}
              </p>

              {/* "Why this?" rationale (Phase 1) + personalization now active via hook (7) */}
              <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono">
                {isRawMode 
                  ? "High X engagement • untouched — strong triage candidate"
                  : "Top performer across your library by X saves & discussion"}
              </div>

              <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                  {bookmark.authorProfileImage ? (
                    <Image
                      src={bookmark.authorProfileImage}
                      alt={`${bookmark.authorDisplayName} avatar`}
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 rounded-full border border-background/70"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline-soft bg-surface-2 font-mono text-[10px] font-bold text-muted-foreground">
                      {bookmark.authorDisplayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    @{bookmark.authorUsername}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground/75">
                  {getHighlightMetric(bookmark)}
                </span>
              </div>

              {/* Phase 1 Flywheel CTA: Direct bridge to Orbit */}
              {onOrbitReview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOrbitReview(bookmark.id);
                  }}
                  className="mt-1 self-start text-[10px] font-mono uppercase tracking-[0.08em] text-primary hover:underline focus-visible:outline-none"
                >
                  Review in Orbit →
                </button>
              )}

              {/* B: Inline feedback (Good boost / Not relevant deboost) + history indicator; uses tick for LS reactivity */}
              <div
                className="mt-1.5 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.05em] text-muted-foreground/70"
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const fb = getHighlightFeedback(bookmark.id);
                  if (fb === "good") {
                    return (
                      <span className="text-emerald-400/90">
                        You marked Great
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLikedHighlightId(bookmark.id);
                            setFeedbackTick((t) => t + 1);
                          }}
                          className="ml-1 underline hover:no-underline"
                        >
                          undo
                        </button>
                      </span>
                    );
                  }
                  if (fb === "not_relevant") {
                    return (
                      <span className="text-amber-400/90">
                        Not relevant to you
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDislikedHighlightId(bookmark.id);
                            setFeedbackTick((t) => t + 1);
                          }}
                          className="ml-1 underline hover:no-underline"
                        >
                          undo
                        </button>
                      </span>
                    );
                  }
                  return (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addLikedHighlightId(bookmark.id);
                          setFeedbackTick((t) => t + 1);
                          toast.success("Boosted for future Highlights & Digests");
                        }}
                        className="text-emerald-300 hover:text-emerald-200 hover:underline focus-visible:outline-none"
                      >
                        Good
                      </button>
                      <span className="text-muted-foreground/40">·</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addDislikedHighlightId(bookmark.id);
                          setFeedbackTick((t) => t + 1);
                          toast.success("Deprioritized in future Highlights");
                        }}
                        className="text-amber-300 hover:text-amber-200 hover:underline focus-visible:outline-none"
                      >
                        Not relevant
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
