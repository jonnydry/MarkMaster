"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";
import {
  addDislikedHighlightId,
  addLikedHighlightId,
  getHighlightFeedback,
  removeDislikedHighlightId,
  removeLikedHighlightId} from "@/lib/highlight-feedback";
import { formatCompactCount } from "@/lib/format-metrics";
import type { BookmarkWithRelations } from "@/types";

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
  if (metrics.like_count > 0) return `${formatCompactCount(metrics.like_count)} likes`;
  if (metrics.retweet_count > 0) return `${formatCompactCount(metrics.retweet_count)} reposts`;
  if (metrics.reply_count > 0) return `${formatCompactCount(metrics.reply_count)} replies`;
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
  layout?: "default" | "carousel";
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
  layout = "default",
  className}: HighlightCardProps) {
  const t = useTypography();
  const [, setFeedbackTick] = useState(0);
  const label = getHighlightLabel(bookmark);
  const isCarouselLayout = layout === "carousel";
  const feedback = getHighlightFeedback(bookmark.id);

  const reviewButton = onOrbitReview ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOrbitReview(bookmark.id);
      }}
      className={cn(
        "self-start rounded-sm border border-transparent text-2xs uppercase tracking-[0.08em] text-primary hover:underline focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
        t.monoNative && t.label
      )}
    >
      Review in Orbit →
    </button>
  ) : null;

  const feedbackControls =
    feedback === "good" ? (
      <span className="text-emerald-400/90">
        You marked Great
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeLikedHighlightId(bookmark.id);
            setFeedbackTick((n) => n + 1);
          }}
          className="ml-1 rounded-sm border border-transparent underline hover:no-underline focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
        >
          undo
        </button>
      </span>
    ) : feedback === "not_relevant" ? (
      <span className="text-amber-400/90">
        Not relevant to you
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeDislikedHighlightId(bookmark.id);
            setFeedbackTick((n) => n + 1);
          }}
          className="ml-1 rounded-sm border border-transparent underline hover:no-underline focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
        >
          undo
        </button>
      </span>
    ) : (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            addLikedHighlightId(bookmark.id);
            setFeedbackTick((n) => n + 1);
            toast.success("Boosted for future Highlights & Digests");
          }}
          className="text-emerald-300 hover:text-emerald-200 hover:underline rounded-sm border border-transparent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
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
          className="text-amber-300 hover:text-amber-200 hover:underline rounded-sm border border-transparent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
        >
          Not relevant
        </button>
      </>
    );

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
        "group flex h-full flex-col rounded-sm border bg-surface-1/55 text-left transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 cursor-pointer",
        isCarouselLayout ? "min-h-[10rem] p-3.5" : "min-h-[8.5rem] p-3",
        active
          ? "border-primary/45 bg-accent-soft/60 hover:bg-accent-soft/70"
          : "border-hairline-soft hover:border-primary/35 hover:bg-surface-1/70",
        className
      )}
      aria-label={`Open highlighted bookmark ${index + 1} from ${bookmark.authorDisplayName}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-2xs font-bold uppercase tracking-[0.08em] text-primary",
              t.monoNative && t.label
            )}
          >
            {label}
          </span>
          {itemLabel ? (
            <span
              className={cn(
                "rounded-sm px-1.5 py-px",
                "border border-amber-400/20 bg-amber-400/10 text-2xs uppercase tracking-wider text-amber-200"
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
        <span className={cn(t.data, "text-2xs font-bold text-muted-foreground/55")}>
          #{index + 1}
        </span>
      </div>
      <p
        className={cn(
          isCarouselLayout
            ? "mt-2 line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-foreground sm:text-sm"
            : "mt-2 line-clamp-3 text-sm font-bold leading-5 text-foreground",
          t.monoNative && "text-mono-data"
        )}
      >
        {bookmark.tweetText}
      </p>

      <div
        className={cn(
          isCarouselLayout
            ? "mt-1.5 line-clamp-1 text-2xs text-muted-foreground/65"
            : "mt-1 text-2xs text-muted-foreground/70",
          t.monoNative && t.label,
          "normal-case"
        )}
      >
        {isRawMode
          ? "High X engagement • untouched — strong triage candidate"
          : "Top performer across your library by X saves & discussion"}
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-3",
          isCarouselLayout
            ? "mt-3 border-t border-hairline-soft pt-2.5"
            : "mt-auto items-end pt-3"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {bookmark.authorProfileImage ? (
            <Image
              src={bookmark.authorProfileImage}
              alt={`${bookmark.authorDisplayName} avatar`}
              width={24}
              height={24}
              sizes="24px"
              className="h-6 w-6 shrink-0 rounded-full border border-background/70"
            />
          ) : (
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline-soft bg-surface-2 text-2xs font-bold text-muted-foreground",
                t.monoNative && t.data
              )}
            >
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className={cn(
              "truncate text-xs text-muted-foreground",
              t.monoNative && t.data,
              "normal-case"
            )}
          >
            @{bookmark.authorUsername}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 text-2xs text-muted-foreground/75",
            isCarouselLayout
              ? "normal-case tracking-normal"
              : "uppercase tracking-[0.08em]",
            t.monoNative && t.data
          )}
        >
          {getHighlightMetric(bookmark)}
        </span>
      </div>

      {isCarouselLayout ? (
        <div
          className={cn(
            "mt-2 flex items-center justify-between gap-3 text-2xs uppercase tracking-[0.08em] text-muted-foreground/70",
            t.monoNative && t.label
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {reviewButton}
          <div className="ml-auto flex min-w-0 items-center gap-2">{feedbackControls}</div>
        </div>
      ) : (
        <>
          {reviewButton ? <div className="mt-1">{reviewButton}</div> : null}
          <div
            className={cn(
              "mt-1.5 flex items-center gap-2 text-2xs uppercase tracking-[0.08em] text-muted-foreground/70",
              t.monoNative && t.label
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {feedbackControls}
          </div>
        </>
      )}
    </article>
  );
}
