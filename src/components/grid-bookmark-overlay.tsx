"use client";

import Image from "next/image";
import {
  ArchiveX,
  ArrowUpRight,
  FolderInput,
  Link2,
  NotebookPen,
  Tags,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
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
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

interface GridBookmarkOverlayProps {
  bookmark: BookmarkWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTag: (bookmarkId: string) => void;
  onAddToCollection: (bookmarkId: string) => void;
  onAddNote: (bookmarkId: string) => void;
  onReviewInOrbit: (bookmarkId: string) => void;
  onDelete: (bookmarkId: string) => void;
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function OverlayToolButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: React.ElementType;
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

export function GridBookmarkOverlay({
  bookmark,
  open,
  onOpenChange,
  onAddTag,
  onAddToCollection,
  onAddNote,
  onReviewInOrbit,
  onDelete,
}: GridBookmarkOverlayProps) {
  const tweetUrl = bookmark ? getBookmarkTweetUrl(bookmark) : null;

  const closeAndRun = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const handleCopyLink = () => {
    if (!tweetUrl) return;
    void navigator.clipboard.writeText(tweetUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy link")
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-background/35 supports-backdrop-filter:backdrop-blur-xl dark:bg-black/45"
        className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[1120px] overflow-hidden border border-hairline-strong bg-surface-1/78 p-0 shadow-[0_30px_120px_-50px_rgba(0,0,0,0.95)] supports-[backdrop-filter]:backdrop-blur-2xl sm:max-w-[1120px]"
      >
        <DialogTitle className="sr-only">
          {bookmark ? `Expanded bookmark from ${bookmark.authorDisplayName}` : "Expanded bookmark"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Full bookmark content and available tools.
        </DialogDescription>

        {bookmark ? (
          <div
            data-grid-expanded-overlay={bookmark.id}
            className="grid max-h-[calc(100dvh-1.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-start gap-3">
                {bookmark.authorProfileImage ? (
                  <Image
                    src={bookmark.authorProfileImage}
                    alt={`${bookmark.authorDisplayName} avatar`}
                    width={44}
                    height={44}
                    className="h-11 w-11 shrink-0 rounded-full"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                    {bookmark.authorDisplayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-base font-semibold text-foreground">
                      {bookmark.authorDisplayName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      @{bookmark.authorUsername}
                    </span>
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(bookmark.tweetCreatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  <XLogoMark
                    className="h-3.5 w-3.5 text-muted-foreground/60"
                    title="Post from X"
                  />
                </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close expanded bookmark"
                  className="rounded-sm border border-hairline-soft bg-surface-2/60 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>

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
                textClassName="whitespace-pre-wrap text-[17px] leading-8 text-foreground"
                galleryClassName="!mt-4 border-hairline-strong bg-black/10"
              />

              {bookmark.quotedTweet ? (
                <div className="mt-4 rounded-sm border border-hairline-soft bg-surface-2/45 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-sm">
                    <span className="font-medium text-foreground">
                      {bookmark.quotedTweet.author?.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{bookmark.quotedTweet.author?.username}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {bookmark.quotedTweet.text}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="min-h-0 overflow-y-auto border-t border-hairline-soft bg-surface-2/48 px-4 py-4 supports-[backdrop-filter]:backdrop-blur-xl lg:border-l lg:border-t-0">
              {bookmark.publicMetrics ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                    <XPostLikeIcon className={X_POST_METRIC_ICON_CLASS} />
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {formatCount(bookmark.publicMetrics.like_count)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Likes
                    </div>
                  </div>
                  <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                    <XPostRepostIcon className={X_POST_METRIC_ICON_CLASS} />
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {formatCount(bookmark.publicMetrics.retweet_count)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Reposts
                    </div>
                  </div>
                  <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
                    <XPostReplyIcon className={X_POST_METRIC_ICON_CLASS} />
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {formatCount(bookmark.publicMetrics.reply_count)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                      Replies
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Tools
                </div>
                <div className="grid gap-2">
                  <OverlayToolButton
                    icon={Tags}
                    label={bookmark.tags.length > 0 ? "Edit tags" : "Add tags"}
                    tone="primary"
                    onClick={() => closeAndRun(() => onAddTag(bookmark.id))}
                  />
                  <OverlayToolButton
                    icon={FolderInput}
                    label={
                      bookmark.collectionItems.length > 0
                        ? "Change collection"
                        : "Add to collection"
                    }
                    onClick={() => closeAndRun(() => onAddToCollection(bookmark.id))}
                  />
                  <OverlayToolButton
                    icon={NotebookPen}
                    label={bookmark.notes.length > 0 ? "Edit note" : "Add note"}
                    onClick={() => closeAndRun(() => onAddNote(bookmark.id))}
                  />
                  <OverlayToolButton
                    icon={OrbitLogoMark}
                    label="Review in Orbit"
                    onClick={() => closeAndRun(() => onReviewInOrbit(bookmark.id))}
                  />
                  <OverlayToolButton
                    icon={ArrowUpRight}
                    label="Open on X"
                    onClick={() => openBookmarkOnX(bookmark)}
                  />
                  <OverlayToolButton
                    icon={Link2}
                    label="Copy link"
                    onClick={handleCopyLink}
                  />
                  <OverlayToolButton
                    icon={ArchiveX}
                    label="Hide from MarkMaster"
                    tone="danger"
                    onClick={() => closeAndRun(() => onDelete(bookmark.id))}
                  />
                </div>
              </div>

              <div className="mt-5 border-t border-hairline-soft pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Tags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bookmark.tags.length > 0 ? (
                    bookmark.tags.map(({ tag }) => (
                      <span
                        key={tag.id}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-hairline-soft bg-surface-1/55 px-2 py-1 text-xs text-muted-foreground"
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate">{tag.name}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground/70">
                      No tags yet
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-hairline-soft pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Collections
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bookmark.collectionItems.length > 0 ? (
                    bookmark.collectionItems.map(({ collection }) => (
                      <span
                        key={collection.id}
                        className="rounded-sm border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {collection.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground/70">
                      Not in a collection
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-hairline-soft pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Notes
                </div>
                {bookmark.notes.length > 0 ? (
                  <div className="rounded-sm border-l-2 border-l-note bg-surface-1/45 px-3 py-2 text-sm leading-6 text-muted-foreground">
                    {bookmark.notes[0]?.content}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/70">
                    No notes yet
                  </span>
                )}
              </div>
            </aside>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
