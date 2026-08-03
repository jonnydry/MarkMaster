"use client";

import { memo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import {
  ArrowUpRight,
  BadgeCheck,
  FolderInput,
  NotebookPen,
  Tags,
} from "lucide-react";

import { XLogoMark } from "@/components/brands/x-logo-mark";
import {
  BookmarkCardActionButton,
  BookmarkCardSelectionToggle,
  BookmarkTagChip,
} from "@/components/bookmark-card-chrome";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { openBookmarkOnX } from "@/lib/bookmark-url";
import { formatCompactCount } from "@/lib/format-metrics";
import { highlightActiveClass } from "@/lib/highlight-chrome";
import { GRID_POST_TEXT_MEDIA, GRID_POST_TEXT_ONLY } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { useBookmarkHighlighting } from "@/hooks/use-bookmark-highlighting";
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
  const likeLabel = metrics?.like_count ? `${formatCompactCount(metrics.like_count)} likes` : null;
  const isInteractive = selectionMode || Boolean(onSelect);
  const {
    highlightedText,
    highlightedAuthorName,
    highlightedUsername,
  } = useBookmarkHighlighting(bookmark, searchQuery);

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
        "group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden surface-card text-left [content-visibility:auto] [contain-intrinsic-size:auto_280px] transition-[border-color,background-color] duration-200 hover:border-primary/30 hover:bg-accent-soft/40",
        isInteractive && "cursor-pointer",
        selected || isPerformanceHighlight
          ? isPerformanceHighlight
            ? "border-primary/70 ring-2 ring-primary/35"
            : "border-primary/45 ring-1 ring-primary/35"
          : "",
        className
      )}
      role={isInteractive ? "button" : undefined}
      data-dashboard-bookmark-id={bookmark.id}
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
          <BookmarkCardSelectionToggle
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
            <span className="rounded-sm border border-white/15 bg-black/45 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-white/85 backdrop-blur-sm">
              {getGridMediaLabel(mediaItems)}
            </span>
          </div>
          {mediaCount > 1 || likeLabel ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 via-black/20 to-transparent p-2 pt-8 text-2xs font-medium text-white/80">
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
              sizes="24px"
              className="h-6 w-6 shrink-0 rounded-full"
            />
          ) : (
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold text-muted-foreground"
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
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
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
            <span className="shrink-0 text-2xs font-medium text-muted-foreground/75">
              {likeLabel}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "mt-2 line-clamp-3",
            hasVisual ? GRID_POST_TEXT_MEDIA : cn(GRID_POST_TEXT_ONLY, "line-clamp-6"),
          )}
        >
          {highlightedText}
        </p>

        {(primaryTag || hasCollection || hasNote) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {primaryTag ? (
              <BookmarkTagChip
                name={primaryTag.name}
                color={primaryTag.color}
                extraCount={extraTagCount || undefined}
                density="strong"
                uppercase={false}
                onClick={() => onTagClick?.(primaryTag.id)}
              />
            ) : null}
            {hasCollection ? (
              <span className={cn("inline-flex h-5 items-center px-1.5 text-2xs font-medium", highlightActiveClass)}>
                In collection
              </span>
            ) : null}
            {hasNote ? (
              <span className="inline-flex h-5 items-center surface-inset-strong px-1.5 text-2xs font-medium text-muted-foreground">
                Note
              </span>
            ) : null}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1 border-t border-hairline-soft pt-2.5">
          {onAddTag && (
            <BookmarkCardActionButton
              icon={Tags}
              label={hasTag ? "Edit tags" : "Add tags"}
              onClick={() => onAddTag(bookmark.id)}
              active={hasTag}
            />
          )}
          {onAddToCollection && (
            <BookmarkCardActionButton
              icon={FolderInput}
              label={hasCollection ? "Change collection" : "Add to collection"}
              onClick={() => onAddToCollection(bookmark.id)}
              active={hasCollection}
            />
          )}
          {onAddNote && (
            <BookmarkCardActionButton
              icon={NotebookPen}
              label={hasNote ? "Edit note" : "Add note"}
              onClick={() => onAddNote(bookmark.id)}
              active={hasNote}
            />
          )}
          <BookmarkCardActionButton
            icon={ArrowUpRight}
            label="Open on X"
            onClick={() => openBookmarkOnX(bookmark)}
            className="ml-auto"
          />
        </div>
      </div>
    </div>
  );
});
