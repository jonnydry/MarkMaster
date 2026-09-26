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
  Orbit,
  Tags,
} from "lucide-react";

import { XLogoMark } from "@/components/brands/x-logo-mark";
import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { formatBookmarkDisplayText } from "@/lib/bookmark-display-text";
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
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "min-w-0 gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground hover:bg-hover hover:text-foreground",
        active && "text-primary hover:text-primary"
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
          "flex min-h-72 items-center justify-center border-l border-hairline-soft bg-background p-6 text-center",
          className
        )}
      >
        <div>
          <ImageIcon className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
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
      className={cn("border-l border-hairline-soft bg-background", className)}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline-soft bg-background px-4 py-2">
        <p className="text-[13px] font-semibold text-foreground">
          Preview{" "}
          <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
            {activeIndex + 1} of {bookmarks.length}
          </span>
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!hasPrevious}
            onClick={() => hasPrevious && onSelect(bookmarks[activeIndex - 1]!.id)}
            aria-label="Preview previous bookmark"
            className="rounded-sm text-muted-foreground hover:bg-hover hover:text-foreground"
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
            className="rounded-sm text-muted-foreground hover:bg-hover hover:text-foreground"
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
            urls={bookmark.urls}
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
          <div className="flex h-24 items-center justify-center surface-inset text-muted-foreground">
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
              <XLogoMark className="size-3 shrink-0 text-muted-foreground" title="Post from X" />
            </div>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-foreground">
          {formatBookmarkDisplayText(bookmark)}
        </p>

        <div
          className="mt-4 flex min-w-0 flex-wrap items-center gap-1 border-y border-hairline-soft py-1.5"
          aria-label="Bookmark actions"
        >
          <InspectorAction
            icon={ArrowUpRight}
            label="Open"
            onClick={() => openBookmarkOnX(bookmark)}
          />
          <InspectorAction
            icon={Tags}
            label={bookmark.tags.length > 0 ? "Edit tags" : "Add tag"}
            active={bookmark.tags.length > 0}
            onClick={() => onAddTag(bookmark.id)}
          />
          <InspectorAction
            icon={FolderInput}
            label={
              bookmark.collectionItems.length > 0
                ? "Edit collections"
                : "Add to collection"
            }
            active={bookmark.collectionItems.length > 0}
            onClick={() => onAddToCollection(bookmark.id)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More bookmark actions"
              className="ml-auto inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-sm border border-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
              <span>More</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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

        {/* Tag/collection edit lives in the action strip above — sections
            only list what's already applied so scanning stays one-path. */}
        <BookmarkOverlayTagsSection tags={bookmark.tags} />
        <BookmarkOverlayCollectionsSection
          collections={bookmark.collectionItems}
        />
        <BookmarkOverlayNotesSection
          notes={bookmark.notes}
          actionLabel={bookmark.notes.length > 0 ? "Edit note" : "Add note"}
          onAction={() => onAddNote(bookmark.id)}
        />
      </div>
    </aside>
  );
}
