"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
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
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BookmarkWithRelations, ViewMode } from "@/types";

interface BookmarkCardProps {
  bookmark: BookmarkWithRelations;
  viewMode: ViewMode;
  onTagClick?: (tagId: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  onAddNote?: (bookmarkId: string) => void;
  onDelete?: (bookmarkId: string) => void;
  selected?: boolean;
  onSelect?: (bookmarkId: string) => void;
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
      className="px-2 py-0.5 rounded bg-card text-[11px] font-medium text-[#52525b] hover:text-foreground transition-colors"
    >
      {name}
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
  selected,
  onSelect,
}: BookmarkCardProps) {
  const [imageError, setImageError] = useState<Set<string>>(new Set());
  const metrics = bookmark.publicMetrics;
  const mediaItems = bookmark.media as BookmarkWithRelations["media"];
  const tweetUrl = `https://x.com/${bookmark.authorUsername}/status/${bookmark.tweetId}`;

  if (viewMode === "compact") {
    return (
      <div
        className={`flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors cursor-pointer ${selected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
        onClick={() => onSelect?.(bookmark.id)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-[#e4e4e7] truncate">
              {bookmark.authorDisplayName}
            </span>
            {bookmark.authorVerified && (
              <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
            )}
            <span className="text-[#3f3f46] truncate">
              @{bookmark.authorUsername}
            </span>
            <span className="text-[#27272a]">·</span>
            <span className="text-[#3f3f46] text-xs whitespace-nowrap">
              {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          <p className="text-sm text-[#d4d4d8] mt-0.5 line-clamp-1">
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
          <div className="flex items-center gap-3 text-xs text-[#27272a] shrink-0">
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
    return (
      <div
        className={`group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-all cursor-pointer ${selected ? "ring-2 ring-primary" : ""}`}
        onClick={() => onSelect?.(bookmark.id)}
      >
        {firstMedia?.url && !imageError.has(firstMedia.url) && (
          <div className="aspect-video bg-muted overflow-hidden">
            <img
              src={firstMedia.url || firstMedia.preview_image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={() => {
                const url = firstMedia.url || firstMedia.preview_image_url || "";
                setImageError((prev) => new Set(prev).add(url));
              }}
            />
          </div>
        )}
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            {bookmark.authorProfileImage && (
              <img
                src={bookmark.authorProfileImage}
                alt=""
                className="w-5 h-5 rounded-full"
              />
            )}
            <span className="text-xs font-medium text-[#71717a] truncate">
              @{bookmark.authorUsername}
            </span>
          </div>
          <p className="text-sm text-[#d4d4d8] line-clamp-3">
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
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group px-8 py-5 border-b border-border hover:bg-muted/20 transition-colors ${selected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
    >
      <div className="flex gap-3.5">
        {bookmark.authorProfileImage ? (
          <img
            src={bookmark.authorProfileImage}
            alt=""
            className="w-[38px] h-[38px] rounded-full shrink-0"
          />
        ) : (
          <div className="w-[38px] h-[38px] rounded-full bg-secondary shrink-0 flex items-center justify-center">
            <span className="text-[13px] font-semibold text-[#52525b]">
              {bookmark.authorDisplayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm text-[#e4e4e7] truncate">
                {bookmark.authorDisplayName}
              </span>
              {bookmark.authorVerified && (
                <BadgeCheck className="w-[14px] h-[14px] text-primary shrink-0" />
              )}
              <span className="text-[13px] text-[#3f3f46] truncate">
                @{bookmark.authorUsername}
              </span>
              <span className="text-[13px] text-[#27272a]">·</span>
              <span className="text-[13px] text-[#3f3f46] whitespace-nowrap">
                {formatDistanceToNow(new Date(bookmark.tweetCreatedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-[#27272a]"
                />}
              >
                <MoreHorizontal className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAddTag?.(bookmark.id)}>
                  <Tag className="w-4 h-4 mr-2" /> Add Tag
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onAddToCollection?.(bookmark.id)}
                >
                  <FolderPlus className="w-4 h-4 mr-2" /> Add to Collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddNote?.(bookmark.id)}>
                  <StickyNote className="w-4 h-4 mr-2" /> Add Note
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => window.open(tweetUrl, "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" /> Open on X
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete?.(bookmark.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-1.5 text-[15px] leading-[23px] text-[#d4d4d8] whitespace-pre-wrap">
            {highlightText(bookmark.tweetText)}
          </div>

          {mediaItems && mediaItems.length > 0 && (
            <div
              className={`mt-3 rounded-[10px] overflow-hidden border border-border ${
                mediaItems.length === 1
                  ? ""
                  : "grid grid-cols-2 gap-0.5"
              }`}
            >
              {mediaItems.slice(0, 4).map((m, i) => {
                const url = m.url || m.preview_image_url;
                if (!url || imageError.has(url)) return null;
                return (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className={`w-full object-cover ${
                      mediaItems.length === 1
                        ? "max-h-80"
                        : "aspect-square"
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
                <span className="font-medium text-sm text-[#e4e4e7]">
                  {bookmark.quotedTweet.author?.name}
                </span>
                <span className="text-[13px] text-[#3f3f46]">
                  @{bookmark.quotedTweet.author?.username}
                </span>
              </div>
              <p className="text-sm text-[#d4d4d8] line-clamp-3">
                {bookmark.quotedTweet.text}
              </p>
            </div>
          )}

          {bookmark.notes.length > 0 && (
            <div className="mt-3 pl-3.5 py-2.5 pr-3 border-l-2 border-l-primary rounded-r-md bg-primary/[0.04]">
              <p className="text-[13px] leading-[18px] text-[#5b8fb8]">
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
            <div className="flex items-center gap-4 mt-2.5 text-[#27272a]">
              <span className="flex items-center gap-1 text-xs" title={`${metrics.reply_count} replies`}>
                <MessageCircle className="w-[13px] h-[13px]" />
                {formatCount(metrics.reply_count)}
              </span>
              <span className="flex items-center gap-1 text-xs" title={`${metrics.retweet_count} retweets`}>
                <Repeat2 className="w-[13px] h-[13px]" />
                {formatCount(metrics.retweet_count)}
              </span>
              <span className="flex items-center gap-1 text-xs" title={`${metrics.like_count} likes`}>
                <Heart className="w-[13px] h-[13px]" />
                {formatCount(metrics.like_count)}
              </span>
              <a
                href={tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-[#52525b] hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
