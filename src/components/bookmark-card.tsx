"use client";

import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import {
  ArrowUpRight,
  ArchiveX,
  Tags,
  FolderInput,
  NotebookPen,
  Maximize2,
  Minimize2,
  BadgeCheck} from "lucide-react";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import {
  X_POST_METRIC_ICON_CLASS,
  XPostLikeIcon,
  XPostReplyIcon,
  XPostRepostIcon} from "@/components/brands/x-post-metric-icons";
import { BookmarkMediaGallery } from "@/components/bookmark-media-gallery";
import {
  BookmarkCardActionButton,
  BookmarkCardSelectionToggle,
  BookmarkCardTagPill,
} from "@/components/bookmark-card-chrome";
import { getBookmarkTweetUrl } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";
import { formatCompactCount } from "@/lib/format-metrics";
import { useTypography } from "@/hooks/use-typography";
import { useBookmarkHighlighting } from "@/hooks/use-bookmark-highlighting";
import type { BookmarkWithRelations, ViewMode } from "@/types";

interface BookmarkCardProps {
  bookmark: BookmarkWithRelations;
  viewMode: Exclude<ViewMode, "grid">;
  searchQuery?: string;
  onTagClick?: (tagId: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  onAddNote?: (bookmarkId: string) => void;
  onDelete?: (bookmarkId: string) => void;
  deleteLabel?: string;
  selected?: boolean;
  onSelect?: (bookmarkId: string) => void;
  selectionMode?: boolean;
  onSelectionChange?: (bookmarkId: string, selected: boolean) => void;
  className?: string;
  rank?: number;
  /** First above-the-fold card with media: set so the hero image is not lazy-loaded (LCP). */
  priorityMedia?: boolean;
  /** The card is the currently focused performance highlight (single-item triage view). */
  isPerformanceHighlight?: boolean;
  /** Compact rows can open into the regular feed card without changing the whole list view. */
  compactExpanded?: boolean;
  onCompactExpandedChange?: (bookmarkId: string, expanded: boolean) => void;
  /** Opens the shared full bookmark overlay used by the grid view. */
  onOpenExpanded?: (bookmarkId: string) => void;
}

function BookmarkRank({
  rank,
  compact = false}: {
  rank?: number;
  compact?: boolean;

}) {
  if (typeof rank !== "number") return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "tabular-nums text-muted-foreground/55",
        "flex shrink-0 flex-col items-center",
        compact ? "w-7 pt-0.5" : "w-8 pt-1"
      )}
    >
      <span
        className={cn(
          "font-bold text-muted-foreground/55",
          compact ? "text-xs leading-4" : "text-sm leading-4"
        )}
      >
        {rank}
      </span>
      <span className="mt-1 h-1.5 w-1.5 rounded-[2px] border border-hairline-soft bg-surface-2" />
    </div>
  );
}

export const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  viewMode,
  searchQuery,
  onTagClick,
  onAddTag,
  onAddToCollection,
  onAddNote,
  onDelete,
  deleteLabel = "Hide from MarkMaster",
  selected,
  onSelect,
  selectionMode = false,
  onSelectionChange,
  className,
  rank,
  priorityMedia = false,
  isPerformanceHighlight = false,
  compactExpanded = false,
  onCompactExpandedChange,
  onOpenExpanded}: BookmarkCardProps) {
  const t = useTypography();
  const metrics = bookmark.publicMetrics;
  const mediaItems = bookmark.media as BookmarkWithRelations["media"];
  const tweetUrl = getBookmarkTweetUrl(bookmark) ?? "";
  const canExpandCompact = viewMode === "compact" && Boolean(onCompactExpandedChange);
  const isInteractive = selectionMode || Boolean(onSelect) || canExpandCompact;
  const {
    highlightedText,
    highlightedAuthorName,
    highlightedUsername,
    highlightedNote,
  } = useBookmarkHighlighting(bookmark, searchQuery);
  const handleCardActivation = () => {
    if (selectionMode) {
      onSelectionChange?.(bookmark.id, !selected);
      return;
    }

    if (canExpandCompact) {
      if (compactExpanded) {
        if (onOpenExpanded) {
          onOpenExpanded(bookmark.id);
          return;
        }
        onCompactExpandedChange?.(bookmark.id, false);
        return;
      }

      onCompactExpandedChange?.(bookmark.id, true);
      return;
    }

    onSelect?.(bookmark.id);
  };
  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-bookmark-media-gallery]")
    ) {
      return;
    }
    handleCardActivation();
  };
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardActivation();
    }
  };

  if (viewMode === "compact" && !compactExpanded) {
    return (
      <div
        className={`flex items-start gap-3 border-b border-hairline-soft px-4 py-3 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:80px] hover:bg-accent-soft/40 ${
          isInteractive ? "cursor-pointer" : ""
        } ${
          selected
            ? "border-l-2 border-l-primary bg-primary/[0.04]"
            : ""
        }${className ? ` ${className}` : ""}`}
        data-dashboard-bookmark-id={bookmark.id}
        tabIndex={isInteractive ? 0 : undefined}
        aria-current={isInteractive && selected ? "true" : undefined}
        aria-expanded={canExpandCompact ? false : undefined}
        aria-label={
          isInteractive
            ? `${
                canExpandCompact ? "Expand bookmark from" : "Bookmark from"
              } ${bookmark.authorDisplayName}: ${bookmark.tweetText.slice(0, 80)}`
            : undefined
        }
        onClick={isInteractive ? handleCardClick : undefined}
        onKeyDown={handleCardKeyDown}
      >
        <BookmarkRank rank={rank} compact  />
        {selectionMode && (
          <BookmarkCardSelectionToggle
            selected={selected}
            onToggle={() => onSelectionChange?.(bookmark.id, !selected)}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground truncate">
              {highlightedAuthorName}
            </span>
            {bookmark.authorVerified && (
              <BadgeCheck
                className="size-3.5 text-primary shrink-0"
                aria-label="Verified account"
              />
            )}
            <span className="text-muted-foreground truncate">
              @{highlightedUsername}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                addSuffix: true})}
            </span>
            <XLogoMark
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
              title="Post from X"
            />
          </div>
          {isPerformanceHighlight && (
            <div
              className={
                "-mt-0.5 mb-1.5 inline-flex items-center gap-1 rounded-sm bg-primary/10 px-2 py-px text-2xs font-semibold uppercase tracking-[0.08em] text-primary"
              }
            >
              Performance highlight • Top engagement unsorted
            </div>
          )}
          <p className="text-sm text-foreground mt-0.5 line-clamp-1">
            {highlightedText}
          </p>
          {bookmark.tags.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              {bookmark.tags.map(({ tag }) => (
                <BookmarkCardTagPill
                  key={tag.id}
                  name={tag.name}
                  onClick={() => onTagClick?.(tag.id)}

                />
              ))}
            </div>
          )}
        </div>
        {metrics && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1">
              <XPostLikeIcon className={X_POST_METRIC_ICON_CLASS} />
              {formatCompactCount(metrics.like_count)}
            </span>
            <span className="flex items-center gap-1">
              <XPostRepostIcon className={X_POST_METRIC_ICON_CLASS} />
              {formatCompactCount(metrics.retweet_count)}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`group border-b border-hairline-soft px-5 py-3.5 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:188px] hover:bg-accent-soft/35 ${
        isInteractive ? "cursor-pointer" : ""
      } ${
        selected || isPerformanceHighlight
          ? isPerformanceHighlight
            ? "border-l-[3px] border-l-primary bg-primary/[0.06] ring-1 ring-inset ring-primary/20"
            : "border-l-2 border-l-primary bg-primary/[0.04]"
          : ""
      } ${
        compactExpanded
          ? "bg-surface-1/80 ring-1 ring-inset ring-primary/15"
          : ""
      }${className ? ` ${className}` : ""}`}
      data-dashboard-bookmark-id={bookmark.id}
      tabIndex={isInteractive ? 0 : undefined}
      aria-current={isInteractive && selected ? "true" : undefined}
      aria-expanded={canExpandCompact ? compactExpanded : undefined}
      aria-label={
        isInteractive
          ? `${
              canExpandCompact
                ? compactExpanded
                  ? onOpenExpanded
                    ? "Open expanded bookmark from"
                    : "Collapse bookmark from"
                  : "Expand bookmark from"
                : "Bookmark from"
            } ${bookmark.authorDisplayName}: ${bookmark.tweetText.slice(0, 80)}`
          : undefined
      }
      onClick={isInteractive ? handleCardClick : undefined}
      onKeyDown={handleCardKeyDown}
    >
      <div className="flex gap-3">
        <BookmarkRank rank={rank}  />
        {selectionMode && (
          <BookmarkCardSelectionToggle
            selected={selected}
            onToggle={() => onSelectionChange?.(bookmark.id, !selected)}
          />
        )}
        {bookmark.authorProfileImage ? (
          <Image
            src={bookmark.authorProfileImage}
            alt={`${bookmark.authorDisplayName} avatar`}
            width={40}
            height={40}
            sizes="40px"
            className="w-10 h-10 rounded-full shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full bg-secondary shrink-0 flex items-center justify-center"
            role="img"
            aria-label={`${bookmark.authorDisplayName} avatar`}
          >
            <span className="text-sm font-semibold text-muted-foreground">
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-x-2 gap-y-0.5 overflow-hidden">
              <span className="font-semibold text-sm text-foreground truncate">
                {highlightedAuthorName}
              </span>
              {bookmark.authorVerified && (
                <BadgeCheck
                  className="size-3.5 text-primary shrink-0"
                  aria-label="Verified account"
                />
              )}
              <span className="text-muted-foreground truncate">
                @{highlightedUsername}
              </span>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className="text-muted-foreground shrink-0 whitespace-nowrap">
                {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                  addSuffix: true})}
              </span>
            </div>
            <XLogoMark
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              title="Post from X"
            />
          </div>

          <div className="mt-2 text-[15px] leading-7 text-foreground whitespace-pre-wrap">
            {highlightedText}
          </div>

          {mediaItems && mediaItems.length > 0 && (
            <BookmarkMediaGallery
              media={mediaItems}
              authorUsername={bookmark.authorUsername}
              variant="feed"
              bookmarkKey={bookmark.id}
              priority={priorityMedia}
              stopClickPropagation
              tweetLink={{
                authorUsername: bookmark.authorUsername,
                tweetId: bookmark.tweetId}}
            />
          )}

          {bookmark.quotedTweet && (
            <div
              aria-label="Quoted tweet"
              className="mt-3 rounded-sm border border-hairline-soft bg-transparent p-3"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-medium text-sm text-foreground">
                  {bookmark.quotedTweet.author?.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  @{bookmark.quotedTweet.author?.username}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {bookmark.quotedTweet.text}
              </p>
            </div>
          )}

          {bookmark.notes.length > 0 && (
            <div className="mt-3 border-l-2 border-l-note bg-transparent px-3 py-2.5">
              <p className="text-xs leading-snug text-muted-foreground">
                {highlightedNote}
              </p>
            </div>
          )}

          {bookmark.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bookmark.tags.map(({ tag }) => (
                <BookmarkCardTagPill
                  key={tag.id}
                  name={tag.name}
                  onClick={() => onTagClick?.(tag.id)}

                />
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline-soft pt-2.5">
            {metrics ? (
              <dl className="flex min-w-0 items-center gap-3 text-muted-foreground">
                <div className="flex items-center gap-1 text-xs">
                  <dt className="sr-only">Replies</dt>
                  <XPostReplyIcon className={X_POST_METRIC_ICON_CLASS} />
                  <dd className={t.monoNative ? t.data : undefined}>{formatCompactCount(metrics.reply_count)}</dd>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <dt className="sr-only">Reposts</dt>
                  <XPostRepostIcon className={X_POST_METRIC_ICON_CLASS} />
                  <dd className={t.monoNative ? t.data : undefined}>{formatCompactCount(metrics.retweet_count)}</dd>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <dt className="sr-only">Likes</dt>
                  <XPostLikeIcon className={X_POST_METRIC_ICON_CLASS} />
                  <dd className={t.monoNative ? t.data : undefined}>{formatCompactCount(metrics.like_count)}</dd>
                </div>
              </dl>
            ) : (
              <div className="min-w-0 flex-1" aria-hidden="true" />
            )}
            <div
              className={cn(
                "flex shrink-0 items-center gap-1 opacity-100 transition-opacity",
                compactExpanded
                  ? "sm:opacity-100"
                  : "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              )}
            >
              {compactExpanded && canExpandCompact && (
                <BookmarkCardActionButton
                  icon={Minimize2}
                  label="Collapse compact preview"
                  onClick={() => onCompactExpandedChange?.(bookmark.id, false)}
                />
              )}
              {onOpenExpanded && (
                <BookmarkCardActionButton
                  icon={Maximize2}
                  label="Open expanded view"
                  onClick={() => onOpenExpanded(bookmark.id)}
                />
              )}
              {onAddTag && (
                <BookmarkCardActionButton
                  icon={Tags}
                  label="Add tags"
                  onClick={() => onAddTag(bookmark.id)}
                  shortcut="T"
                  active={bookmark.tags.length > 0}
                />
              )}
              {onAddToCollection && (
                <BookmarkCardActionButton
                  icon={FolderInput}
                  label="Add to collection"
                  onClick={() => onAddToCollection(bookmark.id)}
                  shortcut="C"
                  active={bookmark.collectionItems && bookmark.collectionItems.length > 0}
                />
              )}
              {onAddNote && (
                <BookmarkCardActionButton
                  icon={NotebookPen}
                  label={bookmark.notes.length > 0 ? "Edit note" : "Add note"}
                  onClick={() => onAddNote(bookmark.id)}
                  shortcut="N"
                  active={bookmark.notes.length > 0}
                />
              )}
              <BookmarkCardActionButton
                icon={ArrowUpRight}
                label="Open on X"
                onClick={() => window.open(tweetUrl, "_blank")}
                shortcut="O"
              />
              {onDelete && (
                <BookmarkCardActionButton
                  icon={ArchiveX}
                  label={deleteLabel}
                  onClick={() => onDelete(bookmark.id)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
