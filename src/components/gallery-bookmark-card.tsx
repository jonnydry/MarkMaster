"use client";

import { memo, type ReactNode } from "react";
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
  ImageMatchLabel,
} from "@/components/bookmark-card-chrome";
import { BookmarkThumbnail } from "@/components/bookmark-thumbnail";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { bookmarkThumbnailPlan } from "@/lib/bookmark-preview";
import { openBookmarkOnX } from "@/lib/bookmark-url";
import { formatCompactCount } from "@/lib/format-metrics";
import { GRID_POST_TEXT_MEDIA, GRID_POST_TEXT_ONLY } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { useBookmarkHighlighting } from "@/hooks/use-bookmark-highlighting";
import type { BookmarkWithRelations } from "@/types";

interface GalleryBookmarkCardProps {
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

const POSTER_IMAGE_SIZES =
  "(max-width: 640px) 88vw, (max-width: 1280px) 46vw, 32vw";

function mediaPosterAspectClass(media?: BookmarkMediaJson): string {
  if (!media?.width || !media.height) return "aspect-[4/5]";
  const ratio = media.width / media.height;
  if (ratio < 0.9) return "aspect-[3/4]";
  if (ratio > 1.35) return "aspect-[5/4]";
  return "aspect-[4/5]";
}

function textPosterAspectClass(text: string): string {
  if (text.length > 160) return "aspect-[3/4]";
  if (text.length > 70) return "aspect-[4/5]";
  return "aspect-[5/4]";
}

function mediaLabel(mediaItems: BookmarkMediaJson[] | null | undefined): string {
  const count = mediaItems?.length ?? 0;
  if (count > 1) return `${count} media`;
  const type = mediaItems?.[0]?.type;
  if (type === "video") return "Video";
  if (type === "animated_gif") return "GIF";
  if (type === "photo" || type === "image") return "Image";
  return "Link";
}

export const GalleryBookmarkCard = memo(function GalleryBookmarkCard({
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
}: GalleryBookmarkCardProps) {
  const mediaItems = bookmark.media;
  const firstMedia = mediaItems?.[0];
  const thumbnailPlan = bookmarkThumbnailPlan(bookmark);
  const hasVisual = Boolean(thumbnailPlan);
  const metrics = bookmark.publicMetrics;
  const hasTag = bookmark.tags.length > 0;
  const hasCollection = Boolean(bookmark.collectionItems?.length);
  const hasNote = bookmark.notes.length > 0;
  const primaryTag = bookmark.tags[0]?.tag;
  const extraTagCount = Math.max(bookmark.tags.length - 1, 0);
  const likeLabel = metrics?.like_count
    ? `${formatCompactCount(metrics.like_count)} likes`
    : null;
  const {
    displayText,
    highlightedText,
    highlightedAuthorName,
    highlightedUsername,
  } = useBookmarkHighlighting(bookmark, searchQuery);

  const activate = () => {
    if (selectionMode) {
      onSelectionChange?.(bookmark.id, !selected);
      return;
    }
    onSelect?.(bookmark.id);
  };

  const marked = Boolean(selected || isPerformanceHighlight);

  return (
    <article
      data-dashboard-bookmark-id={bookmark.id}
      data-gallery-bookmark-card={bookmark.id}
      data-gallery-card-variant={hasVisual ? "media" : "text"}
      className={cn(
        "group relative min-w-0 overflow-hidden surface-card text-left [content-visibility:auto] [contain-intrinsic-size:auto_460px] transition-[border-color,background-color] duration-200",
        marked
          ? "state-selected border-primary/60"
          : "hover:border-primary/25 hover:bg-hover",
        className
      )}
    >
      <button
        type="button"
        onClick={activate}
        aria-label={`Bookmark from ${bookmark.authorDisplayName}: ${displayText.slice(0, 80)}`}
        aria-pressed={selectionMode ? selected : undefined}
        aria-current={!selectionMode && selected ? "true" : undefined}
        className="absolute inset-0 z-0 rounded-sm border border-transparent focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
      />

      {selectionMode ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-20">
          <BookmarkCardSelectionToggle
            selected={selected}
            onToggle={() => onSelectionChange?.(bookmark.id, !selected)}
          />
        </div>
      ) : null}

      <div className="pointer-events-none relative z-10">
        {hasVisual ? (
          <div
            className={cn(
              "relative isolate overflow-hidden bg-muted",
              mediaPosterAspectClass(firstMedia)
            )}
          >
            <BookmarkThumbnail
              bookmark={bookmark}
              alt={`Preview from @${bookmark.authorUsername}`}
              sizes={POSTER_IMAGE_SIZES}
              priority={priorityMedia}
              className="transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              fallback={<div className="size-full bg-muted" />}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-transparent transition-colors duration-200 group-hover:bg-hover motion-reduce:transition-none"
            />
            <div className="pointer-events-none absolute left-2 top-2">
              <span className="rounded-sm bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                {mediaLabel(mediaItems)}
              </span>
            </div>
            <PosterCaption
              className="absolute inset-x-0 bottom-0 border-t border-hairline-soft bg-popover"
              bookmark={bookmark}
              highlightedAuthorName={highlightedAuthorName}
              highlightedUsername={highlightedUsername}
              highlightedText={highlightedText}
              textClassName={cn(GRID_POST_TEXT_MEDIA, "line-clamp-2")}
              likeLabel={likeLabel}
              primaryTag={primaryTag}
              extraTagCount={extraTagCount}
              hasCollection={hasCollection}
              hasNote={hasNote}
              imageMatch={bookmark.imageMatch}
              onTagClick={onTagClick}
              onAddTag={onAddTag}
              onAddToCollection={onAddToCollection}
              onAddNote={onAddNote}
              hasTag={hasTag}
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col justify-between p-4",
              textPosterAspectClass(displayText)
            )}
          >
            <p className={cn(GRID_POST_TEXT_ONLY, "line-clamp-6")}>{highlightedText}</p>
            <PosterCaption
              className="p-0 pt-4"
              bookmark={bookmark}
              highlightedAuthorName={highlightedAuthorName}
              highlightedUsername={highlightedUsername}
              highlightedText={null}
              textClassName=""
              likeLabel={likeLabel}
              primaryTag={primaryTag}
              extraTagCount={extraTagCount}
              hasCollection={hasCollection}
              hasNote={hasNote}
              imageMatch={bookmark.imageMatch}
              onTagClick={onTagClick}
              onAddTag={onAddTag}
              onAddToCollection={onAddToCollection}
              onAddNote={onAddNote}
              hasTag={hasTag}
            />
          </div>
        )}
      </div>
    </article>
  );
});

function PosterCaption({
  bookmark,
  highlightedAuthorName,
  highlightedUsername,
  highlightedText,
  textClassName,
  likeLabel,
  primaryTag,
  extraTagCount,
  hasCollection,
  hasNote,
  imageMatch,
  onTagClick,
  onAddTag,
  onAddToCollection,
  onAddNote,
  hasTag,
  className,
}: {
  bookmark: BookmarkWithRelations;
  highlightedAuthorName: ReactNode;
  highlightedUsername: ReactNode;
  highlightedText: ReactNode | null;
  textClassName: string;
  likeLabel: string | null;
  primaryTag?: { id: string; name: string; color: string };
  extraTagCount: number;
  hasCollection: boolean;
  hasNote: boolean;
  imageMatch?: boolean;
  onTagClick?: (tagId: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  onAddNote?: (bookmarkId: string) => void;
  hasTag: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col p-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {bookmark.authorProfileImage ? (
          <Image
            src={bookmark.authorProfileImage}
            alt={`${bookmark.authorDisplayName} avatar`}
            width={24}
            height={24}
            sizes="24px"
            className="size-6 shrink-0 rounded-full"
          />
        ) : (
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground"
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
            {bookmark.authorVerified ? (
              <BadgeCheck
                className="size-3.5 shrink-0 text-primary"
                aria-label="Verified account"
              />
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              @{highlightedUsername} ·{" "}
              {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                addSuffix: true,
              })}
            </span>
            <XLogoMark
              className="size-3 shrink-0 text-muted-foreground"
              title="Post from X"
            />
          </div>
        </div>
        {likeLabel ? (
          <span className="shrink-0 text-xs text-muted-foreground">{likeLabel}</span>
        ) : null}
      </div>

      {highlightedText ? (
        <p className={cn("mt-2", textClassName)}>{highlightedText}</p>
      ) : null}

      {(primaryTag || hasCollection || hasNote || imageMatch) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {imageMatch ? <ImageMatchLabel /> : null}
          {primaryTag ? (
            <BookmarkTagChip
              name={primaryTag.name}
              color={primaryTag.color}
              extraCount={extraTagCount || undefined}
              density="strong"
              uppercase={false}
              onClick={() => onTagClick?.(primaryTag.id)}
              className="pointer-events-auto"
            />
          ) : null}
          {hasCollection ? (
            <span className="inline-flex h-5 items-center rounded-sm bg-surface-2 px-1.5 text-xs text-muted-foreground">
              In collection
            </span>
          ) : null}
          {hasNote ? (
            <span className="inline-flex h-5 items-center rounded-sm bg-surface-2 px-1.5 text-xs text-muted-foreground">
              Note
            </span>
          ) : null}
        </div>
      )}

      <div className="pointer-events-auto mt-3 flex items-center gap-1 border-t border-hairline-soft pt-2.5">
        {onAddTag ? (
          <BookmarkCardActionButton
            icon={Tags}
            label={hasTag ? "Edit tags" : "Add tags"}
            onClick={() => onAddTag(bookmark.id)}
            active={hasTag}
          />
        ) : null}
        {onAddToCollection ? (
          <BookmarkCardActionButton
            icon={FolderInput}
            label={hasCollection ? "Change collection" : "Add to collection"}
            onClick={() => onAddToCollection(bookmark.id)}
            active={hasCollection}
          />
        ) : null}
        {onAddNote ? (
          <BookmarkCardActionButton
            icon={NotebookPen}
            label={hasNote ? "Edit note" : "Add note"}
            onClick={() => onAddNote(bookmark.id)}
            active={hasNote}
          />
        ) : null}
        <BookmarkCardActionButton
          icon={ArrowUpRight}
          label="Open on X"
          onClick={() => openBookmarkOnX(bookmark)}
          className="ml-auto"
        />
      </div>
    </div>
  );
}
