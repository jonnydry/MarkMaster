"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";
import { useTypography } from "@/hooks/use-typography";
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

export function getHighlightLabel(bookmark: BookmarkWithRelations) {
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

export interface HighlightCardProps {
  bookmark: BookmarkWithRelations;
  index: number;
  active?: boolean;
  isRawMode?: boolean;
  itemLabel?: string;
  onSelect?: (id: string) => void;
  onFocusForTriage?: (id: string) => void;
  onOrbitReview?: (id: string) => void;
  className?: string;
}

export function HighlightCard({
  bookmark,
  index,
  active = false,
  isRawMode = false,
  itemLabel,
  onSelect,
  onFocusForTriage,
  onOrbitReview,
  className,
}: HighlightCardProps) {
  const { isOrbital } = useOrbitalTheme();
  const t = useTypography();
  const [, setFeedbackTick] = useState(0);
  const label = getHighlightLabel(bookmark);

  return (
    <article
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
        "group flex h-full min-h-[8.5rem] flex-col rounded-sm border bg-surface-1/55 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer",
        active
          ? "border-primary/45 bg-accent-soft/60"
          : "border-hairline-soft hover:border-primary/35 hover:bg-surface-1",
        className
      )}
      aria-label={`Open highlighted bookmark ${index + 1} from ${bookmark.authorDisplayName}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[10px] font-bold uppercase tracking-[0.12em] text-primary",
              t.monoNative && t.label
            )}
          >
            {label}
          </span>
          {itemLabel ? (
            <span
              className={cn(
                "rounded px-1.5 py-px text-[9px]",
                isOrbital
                  ? orbital.badge("bronze")
                  : "border border-amber-400/20 bg-amber-400/10 text-[9px] uppercase tracking-wider text-amber-200"
              )}
              title={
                itemLabel.includes("Resurfaced")
                  ? "Forgotten high-performer from >30d ago — resurfaced for review"
                  : undefined
              }
            >
              {itemLabel}
            </span>
          ) : null}
        </div>
        <span className={cn(t.data, "text-[10px] font-bold text-muted-foreground/55")}>
          #{index + 1}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 line-clamp-3 text-sm font-bold leading-5 text-foreground",
          t.monoNative && "text-mono-data"
        )}
      >
        {bookmark.tweetText}
      </p>

      <div
        className={cn(
          "mt-1 text-[10px] text-muted-foreground/70",
          t.monoNative && t.label,
          "normal-case"
        )}
      >
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
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline-soft bg-surface-2 text-[10px] font-bold text-muted-foreground",
                t.monoNative && t.data
              )}
            >
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className={cn(
              "truncate text-[11px] text-muted-foreground",
              t.monoNative && t.data,
              "normal-case"
            )}
          >
            @{bookmark.authorUsername}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/75",
            t.monoNative && t.data
          )}
        >
          {getHighlightMetric(bookmark)}
        </span>
      </div>

      {onOrbitReview ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOrbitReview(bookmark.id);
          }}
          className={cn(
            "mt-1 self-start text-[10px] uppercase tracking-[0.08em] text-primary hover:underline focus-visible:outline-none",
            t.monoNative && t.label
          )}
        >
          Review in Orbit →
        </button>
      ) : null}

      <div
        className={cn(
          "mt-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.05em] text-muted-foreground/70",
          t.monoNative && t.label
        )}
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
                    setFeedbackTick((n) => n + 1);
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
                    setFeedbackTick((n) => n + 1);
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
                  setFeedbackTick((n) => n + 1);
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
                  setFeedbackTick((n) => n + 1);
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
    </article>
  );
}
