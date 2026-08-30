"use client";

import Image from "next/image";
import { BadgeCheck, ImageIcon } from "lucide-react";

import { XLogoMark } from "@/components/brands/x-logo-mark";
import {
  BookmarkCardSelectionToggle,
  BookmarkTagChip,
} from "@/components/bookmark-card-chrome";
import { useTypography } from "@/hooks/use-typography";
import { formatPostDate } from "@/lib/format-metrics";
import { getMediaImageUrl } from "@/lib/bookmark-media";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

interface DashboardBookmarkWorkspaceProps {
  bookmarks: BookmarkWithRelations[];
  activeBookmarkId: string | null;
  selectionMode: boolean;
  selectedBookmarkIdSet: Set<string>;
  onSelect: (bookmarkId: string) => void;
  onSelectionChange: (bookmarkId: string, selected: boolean) => void;
  onTagClick: (tagId: string) => void;
}

function WorkspaceThumbnail({ bookmark }: { bookmark: BookmarkWithRelations }) {
  const media = bookmark.media?.[0];
  const imageUrl = media ? getMediaImageUrl(media) : null;

  return (
    <div className="relative h-[68px] w-24 shrink-0 overflow-hidden surface-inset-strong">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={`Preview from @${bookmark.authorUsername}`}
          fill
          sizes="96px"
          className="object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground/55">
          <ImageIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">Text bookmark</span>
        </div>
      )}
    </div>
  );
}

function WorkspaceAuthor({ bookmark }: { bookmark: BookmarkWithRelations }) {
  const displayName = bookmark.authorDisplayName || bookmark.authorUsername;

  return (
    <div className="hidden min-w-0 items-center gap-2 min-[860px]:flex">
      {bookmark.authorProfileImage ? (
        <Image
          src={bookmark.authorProfileImage}
          alt={`${displayName} avatar`}
          width={26}
          height={26}
          sizes="26px"
          className="size-[26px] shrink-0 rounded-full"
        />
      ) : (
        <span
          className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold text-muted-foreground"
          aria-hidden="true"
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-xs font-semibold text-foreground">
            {displayName}
          </span>
          {bookmark.authorVerified ? (
            <BadgeCheck className="size-3 shrink-0 text-primary" aria-label="Verified account" />
          ) : null}
        </div>
        <span className="block truncate text-2xs text-muted-foreground">
          @{bookmark.authorUsername}
        </span>
      </div>
    </div>
  );
}

function WorkspaceBookmarkRow({
  bookmark,
  active,
  selectionMode,
  selected,
  onSelect,
  onSelectionChange,
  onTagClick,
}: {
  bookmark: BookmarkWithRelations;
  active: boolean;
  selectionMode: boolean;
  selected: boolean;
  onSelect: (bookmarkId: string) => void;
  onSelectionChange: (bookmarkId: string, selected: boolean) => void;
  onTagClick: (tagId: string) => void;
}) {
  const primaryTag = bookmark.tags[0]?.tag;
  const displayName = bookmark.authorDisplayName || bookmark.authorUsername;

  const activate = () => {
    if (selectionMode) {
      onSelectionChange(bookmark.id, !selected);
      return;
    }
    onSelect(bookmark.id);
  };

  return (
    <article
      data-dashboard-bookmark-id={bookmark.id}
      data-workspace-bookmark-row={bookmark.id}
      className={cn(
        "group relative grid min-w-0 cursor-pointer grid-cols-1 gap-3 surface-solid px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-accent-soft/45 min-[860px]:grid-cols-[minmax(0,1fr)_8.5rem_5.5rem] min-[860px]:items-center",
        active && !selectionMode && "border-primary/60 bg-primary/10",
        selected && selectionMode && "border-primary/60 bg-primary/10"
      )}
    >
      <button
        type="button"
        onClick={activate}
        aria-label={`Preview bookmark from ${displayName}: ${bookmark.tweetText.slice(0, 90)}`}
        aria-pressed={selectionMode ? selected : undefined}
        aria-current={!selectionMode && active ? "true" : undefined}
        className="absolute inset-0 z-0 rounded-none border border-transparent focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
      />
      <div className="pointer-events-none relative z-10 flex min-w-0 items-start gap-3">
        {selectionMode ? (
          <div className="pointer-events-auto pt-1">
            <BookmarkCardSelectionToggle
              selected={selected}
              onToggle={() => onSelectionChange(bookmark.id, !selected)}
            />
          </div>
        ) : null}
        <WorkspaceThumbnail bookmark={bookmark} />
        <div className="min-w-0 flex-1 self-center">
          <p className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
            {bookmark.tweetText}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <span className="truncate text-2xs text-muted-foreground min-[860px]:hidden">
              @{bookmark.authorUsername}
            </span>
            <XLogoMark
              className="size-3 shrink-0 text-muted-foreground/55 min-[860px]:hidden"
              title="Post from X"
            />
            {primaryTag ? (
              <BookmarkTagChip
                name={primaryTag.name}
                color={primaryTag.color}
                extraCount={bookmark.tags.length > 1 ? bookmark.tags.length - 1 : undefined}
                density="strong"
                uppercase={false}
                onClick={() => onTagClick(primaryTag.id)}
                className="pointer-events-auto max-w-[9rem]"
              />
            ) : (
              <span className="text-2xs text-muted-foreground/65">Untagged</span>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10">
        <WorkspaceAuthor bookmark={bookmark} />
      </div>

      <div className="pointer-events-none relative z-10 hidden min-[860px]:block">
        <span className="block text-xs tabular-nums text-muted-foreground">
          {formatPostDate(bookmark.tweetCreatedAt)}
        </span>
        <span className="mt-0.5 block text-2xs text-muted-foreground/65">
          Saved {formatPostDate(bookmark.bookmarkedAt)}
        </span>
      </div>
    </article>
  );
}

export function DashboardBookmarkWorkspace({
  bookmarks,
  activeBookmarkId,
  selectionMode,
  selectedBookmarkIdSet,
  onSelect,
  onSelectionChange,
  onTagClick,
}: DashboardBookmarkWorkspaceProps) {
  const t = useTypography();

  return (
    <section aria-label="Bookmark workspace" className="min-w-0 px-3 pb-3 pt-3">
      <div className="sticky top-[var(--header-height)] z-20 grid grid-cols-1 surface-inset-strong px-3 py-2 min-[860px]:grid-cols-[minmax(0,1fr)_8.5rem_5.5rem]">
        <span className={cn(t.label, "font-semibold")}>
          Item
        </span>
        <span className={cn("hidden min-[860px]:block", t.label, "font-semibold")}>
          Author
        </span>
        <span className={cn("hidden min-[860px]:block", t.label, "font-semibold")}>
          Date
        </span>
      </div>
      <div>
        {bookmarks.map((bookmark) => (
          <WorkspaceBookmarkRow
            key={bookmark.id}
            bookmark={bookmark}
            active={bookmark.id === activeBookmarkId}
            selectionMode={selectionMode}
            selected={selectedBookmarkIdSet.has(bookmark.id)}
            onSelect={onSelect}
            onSelectionChange={onSelectionChange}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    </section>
  );
}
