"use client";

import type { ElementType, ReactNode } from "react";
import Image from "next/image";
import { Plus, X } from "lucide-react";

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
import {
  appOverlayBackdropClassName,
  appOverlayDialogBookmarkClassName,
  appOverlayDialogGridBookmarkClassName,
} from "@/lib/app-layout";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

export const BOOKMARK_OVERLAY_DIALOG_CLASS = appOverlayDialogBookmarkClassName;

export const BOOKMARK_OVERLAY_OVERLAY_CLASS = appOverlayBackdropClassName;

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
      variant={
        tone === "danger"
          ? "destructive"
          : tone === "primary"
            ? "outline"
            : "secondary"
      }
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 justify-start gap-2 rounded-sm text-xs",
        tone === "neutral" &&
          "border-hairline-soft bg-transparent text-foreground hover:bg-hover"
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-hairline-soft py-2.5 text-sm">
      {(
        [
          { Icon: XPostLikeIcon, value: metrics.like_count, label: "Likes" },
          { Icon: XPostRepostIcon, value: metrics.retweet_count, label: "Reposts" },
          { Icon: XPostReplyIcon, value: metrics.reply_count, label: "Replies" },
        ] as const
      ).map(({ Icon, value, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon className={X_POST_METRIC_ICON_CLASS} />
          <span className="font-semibold tabular-nums text-foreground">
            {formatCompactCount(value)}
          </span>
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function BookmarkOverlaySectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 text-[13px] font-semibold text-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

function BookmarkOverlaySectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <BookmarkOverlaySectionLabel className="mb-0">{title}</BookmarkOverlaySectionLabel>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAction}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:bg-hover hover:text-foreground"
        >
          <Plus className="size-3" aria-hidden="true" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function BookmarkOverlayTagPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-1 text-xs text-foreground">
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
  actionLabel,
  onAction,
}: {
  tags: BookmarkWithRelations["tags"];
  title?: string;
  emptyLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-5 border-t border-hairline-soft pt-4">
      <BookmarkOverlaySectionHeader
        title={title}
        actionLabel={actionLabel}
        onAction={onAction}
      />
      <div className="flex flex-wrap gap-1.5">
        {tags.length > 0 ? (
          tags.map(({ tag }) => (
            <BookmarkOverlayTagPill key={tag.id} name={tag.name} color={tag.color} />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function BookmarkOverlayCollectionsSection({
  collections,
  actionLabel,
  onAction,
}: {
  collections: BookmarkWithRelations["collectionItems"];
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-5 border-t border-hairline-soft pt-4">
      <BookmarkOverlaySectionHeader
        title="Collections"
        actionLabel={actionLabel}
        onAction={onAction}
      />
      <div className="flex flex-wrap gap-1.5">
        {collections.length > 0 ? (
          collections.map(({ collection }) => (
            <span
              key={collection.id}
              className="rounded-sm bg-surface-2 px-2 py-1 text-xs text-foreground"
            >
              {collection.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">Not in a collection</span>
        )}
      </div>
    </div>
  );
}

export function BookmarkOverlayNotesSection({
  notes,
  actionLabel,
  onAction,
}: {
  notes: BookmarkWithRelations["notes"];
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-5 border-t border-hairline-soft pt-4">
      <BookmarkOverlaySectionHeader
        title="Notes"
        actionLabel={actionLabel}
        onAction={onAction}
      />
      {notes.length > 0 ? (
        <div className="border-l-2 border-l-note bg-surface-2 px-3 py-2 text-sm leading-6 text-foreground">
          {notes[0]?.content}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">No notes yet</span>
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
    <div className="mt-4 surface-inset p-3">
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
          sizes="44px"
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
          <XLogoMark className="h-3.5 w-3.5 text-muted-foreground" title="Post from X" />
        </div>
        {badges ? <div className="mt-1 flex flex-wrap items-center gap-2">{badges}</div> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        aria-label={closeLabel}
        className="surface-inset-strong text-muted-foreground hover:bg-hover hover:text-foreground"
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
            className={appOverlayDialogGridBookmarkClassName}
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
        urls={bookmark.urls}
        tweetLink={{
          authorUsername: bookmark.authorUsername,
          tweetId: bookmark.tweetId,
        }}
        bookmarkKey={bookmark.id}
        variant="overlay"
        priorityMedia
        stopClickPropagation
        className="mt-5"
        textClassName={textClassName}
      />
      {bookmark.quotedTweet ? (
        <BookmarkOverlayQuotedTweet quotedTweet={bookmark.quotedTweet} />
      ) : null}
    </div>
  );
}

export function BookmarkOverlaySidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="scrollbar-native min-h-0 overflow-y-auto border-t border-hairline-soft bg-transparent px-4 py-4 lg:border-l lg:border-t-0">
      {children}
    </aside>
  );
}
