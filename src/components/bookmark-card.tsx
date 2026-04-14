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
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const searchRegex = searchQuery
    ? new RegExp(`(${escapeRegExp(searchQuery)})`, "gi")
    : null;

  const parts = text.split(/((?:@|#)\w+|https?:\/\/\S+)/g);
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
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="px-2 py-0.5 rounded-md text-xs font-medium text-muted-foreground bg-secondary hover:text-foreground transition-colors"
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
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`h-8 px-2 text-xs gap-1.5 ${active ? "text-primary" : "text-muted-foreground"}`}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="sr-only">{label}</span>
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
}: BookmarkCardProps) {
  const [imageError, setImageError] = useState<Set<string>>(new Set());
  const metrics = bookmark.publicMetrics;
  const mediaItems = bookmark.media as BookmarkWithRelations["media"];
  const tweetUrl = `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;
  const highlightedText = useMemo(() => highlightText(bookmark.tweetText, searchQuery), [bookmark.tweetText, searchQuery]);
  const highlightedAuthorName = useMemo(
    () => searchQuery ? highlightMatch(bookmark.authorDisplayName, new RegExp(`(${escapeRegExp(searchQuery)})`, "gi")) : bookmark.authorDisplayName,
    [bookmark.authorDisplayName, searchQuery]
  );
  const highlightedUsername = useMemo(
    () => searchQuery ? highlightMatch(bookmark.authorUsername, new RegExp(`(${escapeRegExp(searchQuery)})`, "gi")) : bookmark.authorUsername,
    [bookmark.authorUsername, searchQuery]
  );
  const highlightedNote = useMemo(
    () => searchQuery && bookmark.notes[0] ? highlightMatch(bookmark.notes[0].content, new RegExp(`(${escapeRegExp(searchQuery)})`, "gi")) : bookmark.notes[0]?.content,
    [bookmark.notes, searchQuery]
  );

  if (viewMode === "compact") {
    return (
      <div
        className={`flex items-start gap-3 px-4 py-2.5 border-b border-border hover:bg-muted/40 transition-all duration-150 cursor-pointer ${
          selected ? "bg-primary/5 border-l-2 border-l-primary" : ""
        }${className ? ` ${className}` : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (selectionMode) {
            onSelectionChange?.(bookmark.id, !selected);
          } else {
            onSelect?.(bookmark.id);
          }
        }}
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
              <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
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
            {searchQuery ? highlightText(bookmark.tweetText, searchQuery) : bookmark.tweetText}
          </p>
          {bookmark.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
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
        className={`group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer ${
          selected ? "ring-2 ring-primary border-primary/40" : ""
        }${className ? ` ${className}` : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (selectionMode) {
            onSelectionChange?.(bookmark.id, !selected);
          } else {
            onSelect?.(bookmark.id);
          }
        }}
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
            {searchQuery ? highlightText(bookmark.tweetText, searchQuery) : bookmark.tweetText}
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
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
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
      className={`group px-5 py-3 border-b border-border hover:bg-muted/30 transition-all duration-150 ${
        selected ? "bg-primary/5 border-l-2 border-l-primary" : ""
      }${className ? ` ${className}` : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (selectionMode) {
          onSelectionChange?.(bookmark.id, !selected);
        }
      }}
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
          <div className="w-10 h-10 rounded-full bg-secondary shrink-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-muted-foreground">
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm text-foreground truncate">
                {highlightedAuthorName}
              </span>
              {bookmark.authorVerified && (
                <BadgeCheck className="w-[14px] h-[14px] text-primary shrink-0" />
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
            <div className="flex items-center gap-1 shrink-0">
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

          <div className="mt-1.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {highlightedText}
          </div>

          {mediaItems && mediaItems.length > 0 && (
            <div
              className={`mt-2.5 rounded-lg overflow-hidden border border-border ${
                mediaItems.length === 1 ? "" : "grid grid-cols-2 gap-0.5"
              }`}
            >
              {mediaItems.slice(0, 4).map((m, i) => {
                const url = m.url || m.preview_image_url;
                if (!url || imageError.has(url)) return null;
                return (
                  <Image
                    key={i}
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
                    onError={() =>
                      setImageError((prev) => new Set(prev).add(url))
                    }
                  />
                );
              })}
            </div>
          )}

          {bookmark.quotedTweet && (
            <div className="mt-2.5 border border-border rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
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
            <div className="mt-2 pl-3 py-2 pr-3 border-l-2 border-l-note rounded-r-md bg-muted/50">
              <p className="text-xs leading-snug text-muted-foreground">
                {highlightedNote}
              </p>
            </div>
          )}

          {bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
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
            <div className="flex items-center gap-3 mt-2 text-muted-foreground">
              <span
                className="flex items-center gap-1 text-xs"
                title={`${metrics.reply_count} replies`}
              >
                <MessageCircle className="w-[13px] h-[13px]" />
                {formatCount(metrics.reply_count)}
              </span>
              <span
                className="flex items-center gap-1 text-xs"
                title={`${metrics.retweet_count} retweets`}
              >
                <Repeat2 className="w-[13px] h-[13px]" />
                {formatCount(metrics.retweet_count)}
              </span>
              <span
                className="flex items-center gap-1 text-xs"
                title={`${metrics.like_count} likes`}
              >
                <Heart className="w-[13px] h-[13px]" />
                {formatCount(metrics.like_count)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});