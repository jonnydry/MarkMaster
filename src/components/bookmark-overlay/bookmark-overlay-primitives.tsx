"use client";

import type { ElementType, ReactNode } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import {
  X_POST_METRIC_ICON_CLASS,
  XPostLikeIcon,
  XPostReplyIcon,
  XPostRepostIcon,
} from "@/components/brands/x-post-metric-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCompactCount, formatPostDate } from "@/lib/format-metrics";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

export const BOOKMARK_OVERLAY_DIALOG_CLASS =
  "max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[1120px] overflow-hidden border border-hairline-strong bg-surface-1/78 p-0 shadow-[0_30px_120px_-50px_rgba(0,0,0,0.95)] supports-[backdrop-filter]:backdrop-blur-2xl sm:max-w-[1120px]";

export const BOOKMARK_OVERLAY_OVERLAY_CLASS =
  "bg-background/35 supports-backdrop-filter:backdrop-blur-xl dark:bg-black/45";

export function BookmarkOverlayToolButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: ElementType;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
}) {
  return (
    <Button
      type="button"
      variant={tone === "danger" ? "destructive" : tone === "primary" ? "default" : "secondary"}
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 justify-start gap-2 rounded-sm text-xs",
        tone === "neutral" &&
          "border-hairline-soft bg-surface-1/55 text-foreground hover:border-primary/30 hover:bg-accent-soft",
        tone === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

export function BookmarkOverlayMetricsGrid({
  metrics,
}: {
  metrics: NonNullable<BookmarkWithRelations["publicMetrics"]>;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
        <XPostLikeIcon className={X_POST_METRIC_ICON_CLASS} />
        <div className="mt-1 text-sm font-semibold text-foreground">
          {formatCompactCount(metrics.like_count)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Likes
        </div>
      </div>
      <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
        <XPostRepostIcon className={X_POST_METRIC_ICON_CLASS} />
        <div className="mt-1 text-sm font-semibold text-foreground">
          {formatCompactCount(metrics.retweet_count)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Reposts
        </div>
      </div>
      <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
        <XPostReplyIcon className={X_POST_METRIC_ICON_CLASS} />
        <div className="mt-1 text-sm font-semibold text-foreground">
          {formatCompactCount(metrics.reply_count)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Replies
        </div>
      </div>
    </div>
  );
}

export function BookmarkOverlaySectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </div>
  );
}

export function BookmarkOverlayTagPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-hairline-soft bg-surface-1/55 px-2 py-1 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function BookmarkOverlayTagsSection({
  tags,
  title = "Tags",
  emptyLabel = "No tags yet",
}: {
  tags: BookmarkWithRelations["tags"];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <div className="mt-5 border-t border-hairline-soft pt-4">
      <BookmarkOverlaySectionLabel>{title}</BookmarkOverlaySectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {tags.length > 0 ? (
          tags.map(({ tag }) => (
            <BookmarkOverlayTagPill key={tag.id} name={tag.name} color={tag.color} />
          ))
        ) : (
          <span className="text-xs text-muted-foreground/70">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function BookmarkOverlayCollectionsSection({
  collections,
}: {
  collections: BookmarkWithRelations["collectionItems"];
}) {
  return (
    <div className="mt-5 border-t border-hairline-soft pt-4">
      <BookmarkOverlaySectionLabel>Collections</BookmarkOverlaySectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {collections.length > 0 ? (
          collections.map(({ collection }) => (
            <span
              key={collection.id}
              className="rounded-sm border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary"
            >
              {collection.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground/70">Not in a collection</span>
        )}
      </div>
    </div>
  );
}

export function BookmarkOverlayNotesSection({
  notes,
}: {
  notes: BookmarkWithRelations["notes"];
}) {
  return (
    <div className="mt-5 border-t border-hairline-soft pt-4">
      <BookmarkOverlaySectionLabel>Notes</BookmarkOverlaySectionLabel>
      {notes.length > 0 ? (
        <div className="rounded-sm border-l-2 border-l-note bg-surface-1/45 px-3 py-2 text-sm leading-6 text-muted-foreground">
          {notes[0]?.content}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground/70">No notes yet</span>
      )}
    </div>
  );
}

export function BookmarkOverlayQuotedTweet({
  quotedTweet,
}: {
  quotedTweet: NonNullable<BookmarkWithRelations["quotedTweet"]>;
}) {
  return (
    <div className="mt-4 rounded-sm border border-hairline-soft bg-surface-2/45 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm">
        <span className="font-medium text-foreground">{quotedTweet.author?.name}</span>
        <span className="text-xs text-muted-foreground">
          @{quotedTweet.author?.username}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{quotedTweet.text}</p>
    </div>
  );
}

export function BookmarkOverlayAuthorHeader({
  bookmark,
  onClose,
  closeLabel,
  badges,
}: {
  bookmark: BookmarkWithRelations;
  onClose: () => void;
  closeLabel: string;
  badges?: ReactNode;
}) {
  const displayName = bookmark.authorDisplayName || bookmark.authorUsername || "?";

  return (
    <div className="flex min-w-0 items-start gap-3">
      {bookmark.authorProfileImage ? (
        <Image
          src={bookmark.authorProfileImage}
          alt={`${displayName} avatar`}
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-full"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-base font-semibold text-foreground">
            {bookmark.authorDisplayName || bookmark.authorUsername}
          </span>
          {bookmark.authorUsername ? (
            <span className="text-sm text-muted-foreground">@{bookmark.authorUsername}</span>
          ) : null}
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="text-sm text-muted-foreground">
            {formatPostDate(bookmark.tweetCreatedAt)}
          </span>
          <XLogoMark className="h-3.5 w-3.5 text-muted-foreground/60" title="Post from X" />
        </div>
        {badges ? <div className="mt-1 flex flex-wrap items-center gap-2">{badges}</div> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        aria-label={closeLabel}
        className="rounded-sm border border-hairline-soft bg-surface-2/60 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

type BookmarkOverlayShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmark: BookmarkWithRelations | null;
  title: string;
  description: string;
  dataAttributeName?: "data-grid-expanded-overlay" | "data-orbit-expanded-overlay";
  children: ReactNode;
};

export function BookmarkOverlayShell({
  open,
  onOpenChange,
  bookmark,
  title,
  description,
  dataAttributeName,
  children,
}: BookmarkOverlayShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={BOOKMARK_OVERLAY_OVERLAY_CLASS}
        className={BOOKMARK_OVERLAY_DIALOG_CLASS}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {bookmark ? (
          <div
            {...(dataAttributeName ? { [dataAttributeName]: bookmark.id } : {})}
            className="grid max-h-[calc(100dvh-1.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            {children}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function BookmarkOverlayPostColumn({
  bookmark,
  header,
  textClassName = "whitespace-pre-wrap text-[17px] leading-8 text-foreground",
}: {
  bookmark: BookmarkWithRelations;
  header: ReactNode;
  textClassName?: string;
}) {
  return (
    <div className="scrollbar-native min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
      {header}
      <BookmarkPostPreview
        tweetText={bookmark.tweetText}
        authorUsername={bookmark.authorUsername}
        media={bookmark.media}
        tweetLink={{
          authorUsername: bookmark.authorUsername,
          tweetId: bookmark.tweetId,
        }}
        bookmarkKey={bookmark.id}
        variant="feed"
        priorityMedia
        stopClickPropagation
        className="mt-5"
        textClassName={textClassName}
        galleryClassName="!mt-4 border-hairline-strong bg-black/10"
      />
      {bookmark.quotedTweet ? (
        <BookmarkOverlayQuotedTweet quotedTweet={bookmark.quotedTweet} />
      ) : null}
    </div>
  );
}

export function BookmarkOverlaySidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="scrollbar-native min-h-0 overflow-y-auto border-t border-hairline-soft bg-surface-2/48 px-4 py-4 supports-[backdrop-filter]:backdrop-blur-xl lg:border-l lg:border-t-0">
      {children}
    </aside>
  );
}
