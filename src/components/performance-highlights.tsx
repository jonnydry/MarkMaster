"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
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
  className?: string;
}

export function PerformanceHighlights({
  bookmarks,
  total,
  title = "Highlights",
  subtitle,
  activeBookmarkId,
  onSelect,
  onFocusForTriage,
  className,
}: PerformanceHighlightsProps) {
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
            <button
              key={bookmark.id}
              type="button"
              onClick={() => {
                onSelect?.(bookmark.id);
                onFocusForTriage?.(bookmark.id);
              }}
              className={cn(
                "group flex min-h-[8.5rem] flex-col rounded-sm border bg-surface-1/55 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                active
                  ? "border-primary/45 bg-accent-soft/60"
                  : "border-hairline-soft hover:border-primary/35 hover:bg-surface-1"
              )}
              aria-label={`Open highlighted bookmark ${index + 1} from ${bookmark.authorDisplayName}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                  {label}
                </span>
                <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground/55">
                  #{index + 1}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 font-mono text-sm font-bold leading-5 text-foreground">
                {bookmark.tweetText}
              </p>
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
            </button>
          );
        })}
      </div>
    </section>
  );
}
