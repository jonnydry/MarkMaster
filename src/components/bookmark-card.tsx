"use client";

import { useState, useMemo, memo } from "react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import {
  Heart,
  Repeat2,
  MessageCircle,
  ExternalLink,
  Tag,
  FolderPlus,
  StickyNote,
  Trash2,
  BadgeCheck,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookmarkWithRelations, ViewMode } from "@/types";

interface BookmarkCardProps {
  bookmark: BookmarkWithRelations;
  viewMode: ViewMode;
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
  /** First above-the-fold card with media: set so the hero image is not lazy-loaded (LCP). */
  priorityMedia?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const MENTION_OR_URL_SPLITTER = /((?:@|#)\w+|https?:\/\/\S+)/g;
const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(s: string): string {
  return s.replace(REGEX_ESCAPE_RE, "\\$&");
}

function buildSearchRegex(searchQuery: string | undefined): RegExp | null {
  if (!searchQuery) return null;
  return new RegExp(`(${escapeRegExp(searchQuery)})`, "gi");
}

function highlightMatch(text: string, regex: RegExp): React.ReactNode {
  if (!text) return text;
  // Capturing group in regex makes split interleave [text, match, text, ...].
  const parts = text.split(regex);
  const result: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) result.push(parts[i]);
    } else {
      result.push(
        <mark key={`m-${i}`} className="bg-primary/20 text-foreground rounded px-0.5">
          {parts[i]}
        </mark>
      );
    }
  }
  if (result.length === 0) return text;
  return result.length === 1 ? result[0] : result;
}

function highlightText(text: string, searchQuery?: string): React.ReactNode {
  const searchRegex = buildSearchRegex(searchQuery);
  const parts = text.split(MENTION_OR_URL_SPLITTER);
  return parts.map((part, i) => {
    if (part.startsWith("@") || part.startsWith("#")) {
      if (searchRegex) {
        return (
          <span key={i} className="text-primary font-medium">
            {highlightMatch(part, searchRegex)}
          </span>
        );
      }
      return (
        <span key={i} className="text-primary font-medium">
          {part}
        </span>
      );
    }
    if (part.startsWith("http")) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {part}
        </a>
      );
    }
    if (searchRegex) {
      return <span key={i}>{highlightMatch(part, searchRegex)}</span>;
    }
    return part;
  });
}

function TagPill({
  name,
  onClick,
}: {
  name: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="rounded-lg border border-hairline-soft bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {name}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
  active,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  shortcut?: string;
  active?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={`rounded-lg border border-transparent ${
        active
          ? "bg-accent-soft text-primary"
          : "text-muted-foreground hover:border-hairline-soft hover:bg-surface-2 hover:text-foreground"
      }`}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    </Button>
  );
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
      className={`flex items-center justify-center w-5 h-5 rounded border transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        selected
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-background border-border text-transparent hover:border-primary/50"
      }`}
    >
      <Check className="w-3.5 h-3.5" />
    </button>
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
  priorityMedia = false,
}: BookmarkCardProps) {
  const [imageError, setImageError] = useState<Set<string>>(() => new Set());
  const metrics = bookmark.publicMetrics;
  const mediaItems = bookmark.media as BookmarkWithRelations["media"];
  const tweetUrl = `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;
  const isInteractive = selectionMode || Boolean(onSelect);
  const handleCardActivation = () => {
    if (selectionMode) {
      onSelectionChange?.(bookmark.id, !selected);
      return;
    }

    onSelect?.(bookmark.id);
  };
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardActivation();
    }
  };
  const highlightedText = useMemo(
    () => highlightText(bookmark.tweetText, searchQuery),
    [bookmark.tweetText, searchQuery]
  );
  const highlightedAuthorName = useMemo(() => {
    const regex = buildSearchRegex(searchQuery);
    return regex ? highlightMatch(bookmark.authorDisplayName, regex) : bookmark.authorDisplayName;
  }, [bookmark.authorDisplayName, searchQuery]);
  const highlightedUsername = useMemo(() => {
    const regex = buildSearchRegex(searchQuery);
    return regex ? highlightMatch(bookmark.authorUsername, regex) : bookmark.authorUsername;
  }, [bookmark.authorUsername, searchQuery]);
  const highlightedNote = useMemo(() => {
    const note = bookmark.notes[0]?.content;
    if (!note) return note;
    const regex = buildSearchRegex(searchQuery);
    return regex ? highlightMatch(note, regex) : note;
  }, [bookmark.notes, searchQuery]);

  if (viewMode === "compact") {
    return (
      <div
        className={`flex items-start gap-3 border-b border-hairline-soft px-4 py-3 transition-all duration-150 hover:bg-surface-1 ${
          isInteractive ? "cursor-pointer" : ""
        } ${
          selected ? "border-l-2 border-l-primary bg-primary/[0.06]" : ""
        }${className ? ` ${className}` : ""}`}
        role={isInteractive ? "button" : undefined}
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
          <SelectionToggle
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
                addSuffix: true,
              })}
            </span>
          </div>
          <p className="text-sm text-foreground mt-0.5 line-clamp-1">
            {highlightedText}
          </p>
          {bookmark.tags.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              {bookmark.tags.map(({ tag }) => (
                <TagPill
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
              <Heart className="w-3 h-3" />
              {formatCount(metrics.like_count)}
            </span>
            <span className="flex items-center gap-1">
              <Repeat2 className="w-3 h-3" />
              {formatCount(metrics.retweet_count)}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === "grid") {
    const firstMedia = mediaItems?.[0];
    const firstMediaUrl = firstMedia?.url || firstMedia?.preview_image_url;
    const hasTag = bookmark.tags.length > 0;
    const hasCollection = bookmark.collectionItems && bookmark.collectionItems.length > 0;

    return (
      <div
        className={`group relative overflow-hidden rounded-xl border border-hairline-soft bg-surface-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${
          isInteractive ? "cursor-pointer" : ""
        } ${
          selected ? "ring-2 ring-primary border-primary/40" : ""
        }${className ? ` ${className}` : ""}`}
        role={isInteractive ? "button" : undefined}
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
          <div className="absolute top-2 right-2 z-10">
            <SelectionToggle
              selected={selected}
              onToggle={() => onSelectionChange?.(bookmark.id, !selected)}
            />
          </div>
        )}
        {firstMediaUrl && !imageError.has(firstMediaUrl) && (
          <div className="relative aspect-video bg-muted overflow-hidden">
            <Image
              src={firstMediaUrl}
              alt={`Media from @${bookmark.authorUsername}`}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover"
              priority={priorityMedia}
              onError={() => {
                setImageError((prev) => new Set(prev).add(firstMediaUrl));
              }}
            />
          </div>
        )}
        <div className="p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            {bookmark.authorProfileImage && (
              <Image
                src={bookmark.authorProfileImage}
                alt={`${bookmark.authorDisplayName} avatar`}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full"
              />
            )}
            <span className="text-xs font-medium text-muted-foreground truncate">
              @{highlightedUsername}
            </span>
          </div>
          <p className="text-sm text-foreground line-clamp-3">
            {highlightedText}
          </p>
          {bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {bookmark.tags.map(({ tag }) => (
                <TagPill
                  key={tag.id}
                  name={tag.name}
                  onClick={() => onTagClick?.(tag.id)}
                />
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1 border-t border-hairline-soft pt-2">
            {onAddTag && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddTag(bookmark.id);
                }}
                className={`h-7 px-2 text-xs gap-1 ${hasTag ? "text-primary" : "text-muted-foreground"}`}
              >
                <Tag className="w-3 h-3" />
              </Button>
            )}
            {onAddToCollection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCollection(bookmark.id);
                }}
                className={`h-7 px-2 text-xs gap-1 ${hasCollection ? "text-primary" : "text-muted-foreground"}`}
              >
                <FolderPlus className="w-3 h-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(tweetUrl, "_blank");
              }}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground ml-auto"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group border-b border-hairline-soft px-5 py-3.5 transition-all duration-150 hover:bg-surface-1/70 ${
        isInteractive ? "cursor-pointer" : ""
      } ${
        selected ? "border-l-2 border-l-primary bg-primary/[0.06]" : ""
      }${className ? ` ${className}` : ""}`}
      role={isInteractive ? "button" : undefined}
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
      <div className="flex gap-3">
        {selectionMode && (
          <SelectionToggle
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-2">
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
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <div className="flex self-start shrink-0 items-center gap-1 rounded-xl border border-hairline-soft bg-surface-1 p-1 shadow-sm opacity-100 transition-all sm:self-auto sm:translate-y-1 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
              {onAddTag && (
                <ActionButton
                  icon={Tag}
                  label="Add Tag"
                  onClick={() => onAddTag(bookmark.id)}
                  shortcut="T"
                  active={bookmark.tags.length > 0}
                />
              )}
              {onAddToCollection && (
                <ActionButton
                  icon={FolderPlus}
                  label="Add to Collection"
                  onClick={() => onAddToCollection(bookmark.id)}
                  shortcut="C"
                  active={bookmark.collectionItems && bookmark.collectionItems.length > 0}
                />
              )}
              {onAddNote && (
                <ActionButton
                  icon={StickyNote}
                  label="Add Note"
                  onClick={() => onAddNote(bookmark.id)}
                  shortcut="N"
                  active={bookmark.notes.length > 0}
                />
              )}
              <ActionButton
                icon={ExternalLink}
                label="Open on X"
                onClick={() => window.open(tweetUrl, "_blank")}
                shortcut="O"
              />
              {onDelete && (
                <ActionButton
                  icon={Trash2}
                  label={deleteLabel}
                  onClick={() => onDelete(bookmark.id)}
                />
              )}
            </div>
          </div>

          <div className="mt-2 text-[15px] leading-7 text-foreground whitespace-pre-wrap">
            {highlightedText}
          </div>

          {mediaItems && mediaItems.length > 0 && (
            <div
              className={`mt-3 overflow-hidden rounded-xl border border-hairline-soft bg-surface-1 ${
                mediaItems.length === 1 ? "" : "grid grid-cols-2 gap-0.5"
              }`}
            >
              {mediaItems.slice(0, 4).map((m, i) => {
                const url = m.url || m.preview_image_url;
                if (!url || imageError.has(url)) return null;
                const isLastTile = i === 3;
                const extraCount = mediaItems.length - 4;
                const showOverlay = isLastTile && extraCount > 0;
                return (
                  <div key={i} className="relative">
                    <Image
                      src={url}
                      alt={`Media ${i + 1} from @${bookmark.authorUsername}`}
                      width={m.width || 1200}
                      height={m.height || 900}
                      sizes={
                        mediaItems.length === 1
                          ? "(max-width: 768px) 100vw, 672px"
                          : "(max-width: 768px) 50vw, 336px"
                      }
                      className={`w-full object-cover ${
                        mediaItems.length === 1 ? "max-h-80" : "aspect-square"
                      }`}
                      priority={priorityMedia && i === 0}
                      onError={() =>
                        setImageError((prev) => new Set(prev).add(url))
                      }
                    />
                    {showOverlay && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white"
                      >
                        +{extraCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {bookmark.quotedTweet && (
            <div
              aria-label="Quoted tweet"
              className="mt-3 rounded-xl border border-hairline-soft bg-surface-1 p-3"
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
            <div className="mt-3 rounded-lg border-l-2 border-l-note bg-surface-2 px-3 py-2.5">
              <p className="text-xs leading-snug text-muted-foreground">
                {highlightedNote}
              </p>
            </div>
          )}

          {bookmark.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bookmark.tags.map(({ tag }) => (
                <TagPill
                  key={tag.id}
                  name={tag.name}
                  onClick={() => onTagClick?.(tag.id)}
                />
              ))}
            </div>
          )}

          {metrics && (
            <dl className="mt-3 flex items-center gap-3 border-t border-hairline-soft pt-2.5 text-muted-foreground">
              <div className="flex items-center gap-1 text-xs">
                <dt className="sr-only">Replies</dt>
                <MessageCircle className="size-3.5" aria-hidden="true" />
                <dd>{formatCount(metrics.reply_count)}</dd>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <dt className="sr-only">Retweets</dt>
                <Repeat2 className="size-3.5" aria-hidden="true" />
                <dd>{formatCount(metrics.retweet_count)}</dd>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <dt className="sr-only">Likes</dt>
                <Heart className="size-3.5" aria-hidden="true" />
                <dd>{formatCount(metrics.like_count)}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
});
