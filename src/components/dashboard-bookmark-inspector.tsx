"use client";

import Image from "next/image";
import {
  ArchiveX,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Clipboard,
  FolderInput,
  ImageIcon,
  MoreHorizontal,
  NotebookPen,
  Orbit,
  Tags,
} from "lucide-react";

import { XLogoMark } from "@/components/brands/x-logo-mark";
import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import {
  BookmarkOverlayCollectionsSection,
  BookmarkOverlayMetricsGrid,
  BookmarkOverlayNotesSection,
  BookmarkOverlayTagsSection,
} from "@/components/bookmark-overlay/bookmark-overlay-primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
import { formatPostDate } from "@/lib/format-metrics";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

interface DashboardBookmarkInspectorProps {
  bookmark: BookmarkWithRelations | null;
  bookmarks: BookmarkWithRelations[];
  onSelect: (bookmarkId: string) => void;
  onAddTag: (bookmarkId: string) => void;
  onAddToCollection: (bookmarkId: string) => void;
  onAddNote: (bookmarkId: string) => void;
  onReviewInOrbit: (bookmarkId: string) => void;
  onDelete: (bookmarkId: string) => void;
  className?: string;
}

function InspectorAction({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onClick}
      className={cn(
        "h-14 min-w-0 flex-col gap-1 rounded-sm border-hairline-soft px-1.5 text-2xs font-semibold text-muted-foreground hover:border-primary/35 hover:bg-accent-soft hover:text-foreground",
        active && "border-primary/35 bg-primary/10 text-primary"
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Button>
  );
}

export function DashboardBookmarkInspector({
  bookmark,
  bookmarks,
  onSelect,
  onAddTag,
  onAddToCollection,
  onAddNote,
  onReviewInOrbit,
  onDelete,
  className,
}: DashboardBookmarkInspectorProps) {
  const activeIndex = bookmark
    ? bookmarks.findIndex((entry) => entry.id === bookmark.id)
    : -1;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < bookmarks.length - 1;

  const handleCopyLink = async () => {
    if (!bookmark) return;
    const tweetUrl = getBookmarkTweetUrl(bookmark);
    if (!tweetUrl) {
      toast.error("This bookmark does not have a shareable link");
      return;
    }
    try {
      await navigator.clipboard.writeText(tweetUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (!bookmark) {
    return (
      <aside
        aria-label="Bookmark preview"
        className={cn(
          "flex min-h-72 items-center justify-center surface-solid p-6 text-center",
          className
        )}
      >
        <div>
          <ImageIcon className="mx-auto size-5 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">Select a bookmark</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Its full post, metadata, and tools will stay ready here.
          </p>
        </div>
      </aside>
    );
  }

  const displayName = bookmark.authorDisplayName || bookmark.authorUsername;

  return (
    <aside
      aria-label={`Previewing bookmark from ${displayName}`}
      aria-live="polite"
      data-dashboard-bookmark-inspector={bookmark.id}
      className={cn("surface-solid", className)}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between surface-inset-strong px-4 py-2.5">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Bookmark preview
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground/70">
            {activeIndex + 1} of {bookmarks.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!hasPrevious}
            onClick={() => hasPrevious && onSelect(bookmarks[activeIndex - 1]!.id)}
            aria-label="Preview previous bookmark"
            className="rounded-sm border border-hairline-soft text-muted-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!hasNext}
            onClick={() => hasNext && onSelect(bookmarks[activeIndex + 1]!.id)}
            aria-label="Preview next bookmark"
            className="rounded-sm border border-hairline-soft text-muted-foreground"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="px-4 pb-5 pt-4">
        {bookmark.media?.length ? (
          <BookmarkPostPreview
            tweetText={bookmark.tweetText}
            authorUsername={bookmark.authorUsername}
            media={bookmark.media}
            tweetLink={{
              authorUsername: bookmark.authorUsername,
              tweetId: bookmark.tweetId,
            }}
            bookmarkKey={bookmark.id}
            variant="inline"
            priorityMedia
            mediaOnly
            stopClickPropagation
            galleryClassName="mt-0 surface-inset"
          />
        ) : (
          <div className="flex h-24 items-center justify-center surface-inset text-muted-foreground/60">
            <ImageIcon className="size-5" aria-hidden="true" />
            <span className="sr-only">Text bookmark</span>
          </div>
        )}

        <div className="mt-4 flex min-w-0 items-center gap-3">
          {bookmark.authorProfileImage ? (
            <Image
              src={bookmark.authorProfileImage}
              alt={`${displayName} avatar`}
              width={42}
              height={42}
              sizes="42px"
              className="size-[42px] shrink-0 rounded-full"
            />
          ) : (
            <div
              className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              {bookmark.authorVerified ? (
                <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Verified account" />
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">@{bookmark.authorUsername}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{formatPostDate(bookmark.tweetCreatedAt)}</span>
              <XLogoMark className="size-3 shrink-0 text-muted-foreground/55" title="Post from X" />
            </div>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-foreground">
          {bookmark.tweetText}
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Bookmark actions">
          <InspectorAction
            icon={ArrowUpRight}
            label="Open"
            onClick={() => openBookmarkOnX(bookmark)}
          />
          <InspectorAction
            icon={Tags}
            label={bookmark.tags.length > 0 ? "Tags" : "Add tag"}
            active={bookmark.tags.length > 0}
            onClick={() => onAddTag(bookmark.id)}
          />
          <InspectorAction
            icon={FolderInput}
            label="Move"
            active={bookmark.collectionItems.length > 0}
            onClick={() => onAddToCollection(bookmark.id)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More bookmark actions"
              className="inline-flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-sm border border-hairline-soft bg-secondary px-1.5 text-2xs font-semibold text-muted-foreground hover:border-primary/35 hover:bg-accent-soft hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
              <span>More</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAddNote(bookmark.id)}>
                <NotebookPen />
                {bookmark.notes.length > 0 ? "Edit note" : "Add note"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReviewInOrbit(bookmark.id)}>
                <Orbit />
                Review in Orbit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleCopyLink()}>
                <Clipboard />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(bookmark.id)}>
                <ArchiveX />
                Hide from MarkMaster
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {bookmark.publicMetrics ? (
          <div className="mt-5">
            <BookmarkOverlayMetricsGrid metrics={bookmark.publicMetrics} />
          </div>
        ) : null}

        <BookmarkOverlayTagsSection tags={bookmark.tags} />
        <BookmarkOverlayCollectionsSection collections={bookmark.collectionItems} />
        <BookmarkOverlayNotesSection notes={bookmark.notes} />
      </div>
    </aside>
  );
}
