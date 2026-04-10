"use client";

import { useState } from "react";
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
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function highlightText(text: string): React.ReactNode {
  const parts = text.split(/((?:@|#)\w+|https?:\/\/\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") || part.startsWith("#")) {
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
      className="px-2 py-0.5 rounded bg-card text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-foreground transition-colors"
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
      className={`flex items-center justify-center w-5 h-5 rounded border transition-colors shrink-0 ${
        selected
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-background/90 border-border text-transparent hover:border-primary/50"
      }`}
    >
      <Check className="w-3.5 h-3.5" />
    </button>
  );
}

export function BookmarkCard({
  bookmark,
  viewMode,
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
}: BookmarkCardProps) {
  const [imageError, setImageError] = useState<Set<string>>(new Set());
  const metrics = bookmark.publicMetrics;
  const mediaItems = bookmark.media as BookmarkWithRelations["media"];
  const tweetUrl = `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;

  if (viewMode === "compact") {
    return (
      <div
        className={`flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors cursor-pointer ${
          selected ? "bg-primary/5 border-l-2 border-l-primary" : ""
        }`}
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
            <span className="font-semibold text-zinc-200 truncate">
              {bookmark.authorDisplayName}
            </span>
            {bookmark.authorVerified && (
              <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
            )}
            <span className="text-zinc-500 truncate">
              @{bookmark.authorUsername}
            </span>
            <span className="text-zinc-700 dark:text-zinc-300">·</span>
            <span className="text-zinc-500 text-xs whitespace-nowrap">
              {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          <p className="text-sm text-zinc-300 mt-0.5 line-clamp-1">
            {bookmark.tweetText}
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
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500 shrink-0 font-mono tabular-nums">
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
        className={`group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-all cursor-pointer ${
          selected ? "ring-2 ring-primary" : ""
        }`}
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
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            {bookmark.authorProfileImage && (
              <Image
                src={bookmark.authorProfileImage}
                alt={`${bookmark.authorDisplayName} avatar`}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full"
              />
            )}
            <span className="text-xs font-medium text-zinc-500 truncate">
              @{bookmark.authorUsername}
            </span>
          </div>
          <p className="text-sm text-zinc-300 line-clamp-3">
            {bookmark.tweetText}
          </p>
          {bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {bookmark.tags.map(({ tag }) => (
                <TagPill
                  key={tag.id}
                  name={tag.name}
                  onClick={() => onTagClick?.(tag.id)}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
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
      className={`group px-6 py-4 border-b border-border hover:bg-muted/10 transition-colors ${
        selected ? "bg-primary/5 border-l-2 border-l-primary" : ""
      }`}
      onClick={() => {
        if (selectionMode) {
          onSelectionChange?.(bookmark.id, !selected);
        }
      }}
    >
      <div className="flex gap-4">
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
            width={44}
            height={44}
            className="w-[44px] h-[44px] rounded-full shrink-0"
          />
        ) : (
          <div className="w-[44px] h-[44px] rounded-full bg-secondary shrink-0 flex items-center justify-center">
            <span className="text-[15px] font-semibold text-zinc-400">
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm text-zinc-200 truncate">
                {bookmark.authorDisplayName}
              </span>
              {bookmark.authorVerified && (
                <BadgeCheck className="w-[14px] h-[14px] text-primary shrink-0" />
              )}
              <span className="text-[13px] text-zinc-500 truncate">
                @{bookmark.authorUsername}
              </span>
              <span className="text-[13px] text-zinc-700 dark:text-zinc-300">·</span>
              <span className="text-[13px] text-zinc-500 whitespace-nowrap">
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

          <div className="mt-2 text-[15px] leading-[22px] text-zinc-300 whitespace-pre-wrap">
            {highlightText(bookmark.tweetText)}
          </div>

          {mediaItems && mediaItems.length > 0 && (
            <div
              className={`mt-3 rounded-[10px] overflow-hidden border border-border ${
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
            <div className="mt-3 border border-border rounded-[10px] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-medium text-sm text-zinc-200">
                  {bookmark.quotedTweet.author?.name}
                </span>
                <span className="text-[13px] text-zinc-500">
                  @{bookmark.quotedTweet.author?.username}
                </span>
              </div>
              <p className="text-sm text-zinc-300 line-clamp-3">
                {bookmark.quotedTweet.text}
              </p>
            </div>
          )}

          {bookmark.notes.length > 0 && (
            <div className="mt-3 pl-3.5 py-2.5 pr-3 border-l-2 border-l-primary rounded-r-md bg-primary/[0.04]">
              <p className="text-[13px] leading-[18px] text-primary/80">
                {bookmark.notes[0].content}
              </p>
            </div>
          )}

          {bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
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
            <div className="flex items-center gap-4 mt-2.5 text-zinc-500 dark:text-zinc-500 font-mono tabular-nums">
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
}
