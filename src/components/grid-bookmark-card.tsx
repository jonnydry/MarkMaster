"use client";

import { memo, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  FolderInput,
  NotebookPen,
  Tags,
} from "lucide-react";

import { XLogoMark } from "@/components/brands/x-logo-mark";
import { Button } from "@/components/ui/button";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { getBookmarkTweetUrl } from "@/lib/bookmark-url";
import { createTextHighlighter } from "@/lib/text-highlighter";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

interface GridBookmarkCardProps {
  bookmark: BookmarkWithRelations;
  searchQuery?: string;
  onTagClick?: (tagId: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  onAddNote?: (bookmarkId: string) => void;
  selected?: boolean;
  onSelect?: (bookmarkId: string) => void;
  selectionMode?: boolean;
  onSelectionChange?: (bookmarkId: string, selected: boolean) => void;
  className?: string;
  priorityMedia?: boolean;
  isPerformanceHighlight?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getGridMediaAspectClass(media?: BookmarkMediaJson): string {
  if (!media?.width || !media.height) return "aspect-[4/3]";

  const ratio = media.width / media.height;
  if (ratio < 0.82) return "aspect-[4/5]";
  if (ratio > 1.7) return "aspect-[16/10]";
  if (ratio > 1.2) return "aspect-[4/3]";
  return "aspect-square";
}

function getGridMediaLabel(mediaItems: BookmarkMediaJson[] | null | undefined): string {
  const count = mediaItems?.length ?? 0;
  if (count > 1) return `${count} media`;

  const type = mediaItems?.[0]?.type;
  if (type === "video") return "Video";
  if (type === "animated_gif") return "GIF";
  return "Image";
}

function SelectionToggle({
  selected,
  onToggle,
}: {
  selected?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={selected}
      aria-label="Select bookmark"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-transparent hover:border-primary/50"
      }`}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

export const GridBookmarkCard = memo(function GridBookmarkCard({
  bookmark,
  searchQuery,
  onTagClick,
  onAddTag,
  onAddToCollection,
  onAddNote,
  selected,
  onSelect,
  selectionMode = false,
  onSelectionChange,
  className,
  priorityMedia = false,
  isPerformanceHighlight = false,
}: GridBookmarkCardProps) {
  const [imageError, setImageError] = useState<Set<string>>(() => new Set());
  const mediaItems = bookmark.media;
  const tweetUrl = getBookmarkTweetUrl(bookmark) ?? "";
  const metrics = bookmark.publicMetrics;
  const firstMedia = mediaItems?.[0];
  const firstMediaUrl = firstMedia?.url || firstMedia?.preview_image_url;
  const hasVisual = Boolean(firstMediaUrl && !imageError.has(firstMediaUrl));
  const mediaCount = mediaItems?.length ?? 0;
  const hasTag = bookmark.tags.length > 0;
  const hasCollection = Boolean(
    bookmark.collectionItems && bookmark.collectionItems.length > 0
  );
  const hasNote = bookmark.notes.length > 0;
  const primaryTag = bookmark.tags[0]?.tag;
  const extraTagCount = Math.max(bookmark.tags.length - 1, 0);
  const likeLabel = metrics?.like_count ? `${formatCount(metrics.like_count)} likes` : null;
  const isInteractive = selectionMode || Boolean(onSelect);
  const highlighter = useMemo(
    () => createTextHighlighter(searchQuery),
    [searchQuery]
  );
  const highlightedText = useMemo(
    () => highlighter.tweet(bookmark.tweetText),
    [bookmark.tweetText, highlighter]
  );
  const highlightedAuthorName = useMemo(
    () => highlighter.plain(bookmark.authorDisplayName, "author"),
    [bookmark.authorDisplayName, highlighter]
  );
  const highlightedUsername = useMemo(
    () => highlighter.plain(bookmark.authorUsername, "username"),
    [bookmark.authorUsername, highlighter]
  );

  const handleCardActivation = () => {
    if (selectionMode) {
      onSelectionChange?.(bookmark.id, !selected);
      return;
    }

    onSelect?.(bookmark.id);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardActivation();
    }
  };

  return (
    <div
      className={cn(
        "group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-sm border border-hairline-soft/80 bg-surface-1/72 text-left shadow-[0_18px_48px_-42px_color-mix(in_srgb,var(--foreground)_75%,transparent)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:bg-surface-1 hover:shadow-[0_22px_58px_-42px_color-mix(in_srgb,var(--primary)_70%,transparent)]",
        isInteractive && "cursor-pointer",
        selected || isPerformanceHighlight
          ? isPerformanceHighlight
            ? "border-primary/70 shadow-sm ring-2 ring-primary/40"
            : "border-primary/45 ring-1 ring-primary/35"
          : "",
        className
      )}
      role={isInteractive ? "button" : undefined}
      data-grid-bookmark-card={bookmark.id}
      data-grid-card-variant={hasVisual ? "media" : "text"}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? selected : undefined}
      aria-label={
        isInteractive
          ? `Bookmark from ${bookmark.authorDisplayName}: ${bookmark.tweetText.slice(0, 80)}`
          : undefined
      }
      onClick={isInteractive ? handleCardActivation : undefined}
      onKeyDown={handleCardKeyDown}
    >
      {selectionMode && (
        <div className="absolute right-2 top-2 z-20">
          <SelectionToggle
            selected={selected}
            onToggle={() => onSelectionChange?.(bookmark.id, !selected)}
          />
        </div>
      )}
      {hasVisual && firstMediaUrl ? (
        <div
          className={cn(
            "relative isolate overflow-hidden bg-muted",
            getGridMediaAspectClass(firstMedia)
          )}
        >
          <Image
            src={firstMediaUrl}
            alt={`Media from @${bookmark.authorUsername}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
            priority={priorityMedia}
            onError={() => {
              setImageError((prev) => new Set(prev).add(firstMediaUrl));
            }}
          />
          <div className="pointer-events-none absolute left-2 top-2">
            <span className="rounded-sm border border-white/15 bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-white/85 shadow-sm backdrop-blur-sm">
              {getGridMediaLabel(mediaItems)}
            </span>
          </div>
          {mediaCount > 1 || likeLabel ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 via-black/20 to-transparent p-2 pt-8 text-[10px] font-medium text-white/80">
              <span>{likeLabel}</span>
              {mediaCount > 1 ? <span>+{mediaCount - 1}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn("flex flex-col", hasVisual ? "p-3" : "p-3.5")}>
        <div className="flex min-w-0 items-center gap-2">
          {bookmark.authorProfileImage ? (
            <Image
              src={bookmark.authorProfileImage}
              alt={`${bookmark.authorDisplayName} avatar`}
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-full"
            />
          ) : (
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground"
              role="img"
              aria-label={`${bookmark.authorDisplayName} avatar`}
            >
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-foreground">
                {highlightedAuthorName}
              </span>
              {bookmark.authorVerified && (
                <BadgeCheck
                  className="size-3.5 shrink-0 text-primary"
                  aria-label="Verified account"
                />
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="truncate">
                @{highlightedUsername} ·{" "}
                {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                  addSuffix: true,
                })}
              </span>
              <XLogoMark
                className="h-3 w-3 shrink-0 text-muted-foreground/55"
                title="Post from X"
              />
            </div>
          </div>
          {!hasVisual && likeLabel ? (
            <span className="shrink-0 text-[10px] font-medium text-muted-foreground/75">
              {likeLabel}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "mt-2 whitespace-pre-wrap text-foreground",
            hasVisual
              ? "line-clamp-3 text-sm leading-5"
              : "line-clamp-6 text-[15px] font-medium leading-6"
          )}
        >
          {highlightedText}
        </p>

        {(primaryTag || hasCollection || hasNote) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {primaryTag ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(primaryTag.id);
                }}
                className="inline-flex h-5 max-w-full items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/70 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:bg-accent-soft hover:text-foreground"
                title={primaryTag.name}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: primaryTag.color }}
                />
                <span className="truncate">{primaryTag.name}</span>
                {extraTagCount > 0 ? (
                  <span className="text-muted-foreground/65">+{extraTagCount}</span>
                ) : null}
              </button>
            ) : null}
            {hasCollection ? (
              <span className="inline-flex h-5 items-center rounded-sm border border-primary/20 bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                In collection
              </span>
            ) : null}
            {hasNote ? (
              <span className="inline-flex h-5 items-center rounded-sm border border-hairline-soft bg-surface-2/70 px-1.5 text-[10px] font-medium text-muted-foreground">
                Note
              </span>
            ) : null}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1 border-t border-hairline-soft/70 pt-2.5">
          {onAddTag && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddTag(bookmark.id);
              }}
              className={cn(
                "rounded-sm border border-transparent",
                hasTag
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground"
              )}
              aria-label={hasTag ? "Edit tags" : "Add tags"}
              title={hasTag ? "Edit tags" : "Add tags"}
            >
              <Tags className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {onAddToCollection && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCollection(bookmark.id);
              }}
              className={cn(
                "rounded-sm border border-transparent",
                hasCollection
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground"
              )}
              aria-label={hasCollection ? "Change collection" : "Add to collection"}
              title={hasCollection ? "Change collection" : "Add to collection"}
            >
              <FolderInput className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {onAddNote && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddNote(bookmark.id);
              }}
              className={cn(
                "rounded-sm border border-transparent",
                hasNote
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground"
              )}
              aria-label={hasNote ? "Edit note" : "Add note"}
              title={hasNote ? "Edit note" : "Add note"}
            >
              <NotebookPen className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(tweetUrl, "_blank");
            }}
            className="ml-auto rounded-sm border border-transparent text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground"
            aria-label="Open on X"
            title="Open on X"
          >
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
});
