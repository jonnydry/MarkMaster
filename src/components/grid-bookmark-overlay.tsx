"use client";

import {
  ArchiveX,
  ArrowUpRight,
  FolderInput,
  Link2,
  NotebookPen,
  Tags,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import {
  BookmarkOverlayAuthorHeader,
  BookmarkOverlayCollectionsSection,
  BookmarkOverlayMetricsGrid,
  BookmarkOverlayNotesSection,
  BookmarkOverlayPostColumn,
  BookmarkOverlaySectionLabel,
  BookmarkOverlayShell,
  BookmarkOverlaySidebar,
  BookmarkOverlayTagsSection,
  BookmarkOverlayToolButton,
} from "@/components/bookmark-overlay/bookmark-overlay-primitives";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
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
    <BookmarkOverlayShell
      open={open}
      onOpenChange={onOpenChange}
      bookmark={bookmark}
      dataAttributeName="data-grid-expanded-overlay"
      title={
        bookmark
          ? `Expanded bookmark from ${bookmark.authorDisplayName}`
          : "Expanded bookmark"
      }
      description="Full bookmark content and available tools."
    >
      {bookmark ? (
        <>
          <BookmarkOverlayPostColumn
            bookmark={bookmark}
            header={
              <BookmarkOverlayAuthorHeader
                bookmark={bookmark}
                onClose={() => onOpenChange(false)}
                closeLabel="Close expanded bookmark"
              />
            }
          />
          <BookmarkOverlaySidebar>
            {bookmark.publicMetrics ? (
              <BookmarkOverlayMetricsGrid metrics={bookmark.publicMetrics} />
            ) : null}

            <div className="mt-5">
              <BookmarkOverlaySectionLabel>Tools</BookmarkOverlaySectionLabel>
              <div className="grid gap-2">
                <BookmarkOverlayToolButton
                  icon={Tags}
                  label={bookmark.tags.length > 0 ? "Edit tags" : "Add tags"}
                  tone="primary"
                  onClick={() => closeAndRun(() => onAddTag(bookmark.id))}
                />
                <BookmarkOverlayToolButton
                  icon={FolderInput}
                  label={
                    bookmark.collectionItems.length > 0
                      ? "Change collection"
                      : "Add to collection"
                  }
                  onClick={() => closeAndRun(() => onAddToCollection(bookmark.id))}
                />
                <BookmarkOverlayToolButton
                  icon={NotebookPen}
                  label={bookmark.notes.length > 0 ? "Edit note" : "Add note"}
                  onClick={() => closeAndRun(() => onAddNote(bookmark.id))}
                />
                <BookmarkOverlayToolButton
                  icon={OrbitLogoMark}
                  label="Review in Orbit"
                  onClick={() => closeAndRun(() => onReviewInOrbit(bookmark.id))}
                />
                <BookmarkOverlayToolButton
                  icon={ArrowUpRight}
                  label="Open on X"
                  onClick={() => openBookmarkOnX(bookmark)}
                />
                <BookmarkOverlayToolButton
                  icon={Link2}
                  label="Copy link"
                  onClick={handleCopyLink}
                />
                <BookmarkOverlayToolButton
                  icon={ArchiveX}
                  label="Hide from MarkMaster"
                  tone="danger"
                  onClick={() => closeAndRun(() => onDelete(bookmark.id))}
                />
              </div>
            </div>

            <BookmarkOverlayTagsSection tags={bookmark.tags} />
            <BookmarkOverlayCollectionsSection collections={bookmark.collectionItems} />
            <BookmarkOverlayNotesSection notes={bookmark.notes} />
          </BookmarkOverlaySidebar>
        </>
      ) : null}
    </BookmarkOverlayShell>
  );
}
