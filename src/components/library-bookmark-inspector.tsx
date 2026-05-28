"use client";

import { ExternalLink, Link2, X } from "lucide-react";
import { toast } from "sonner";

import {
  orbital,
  OrbitalCard,
  TelemetryStat,
} from "@/components/orbital";
import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

export interface LibraryBookmarkInspectorProps {
  bookmark: BookmarkWithRelations;
  onClose: () => void;
  onAddTag: (bookmarkId: string) => void;
  onAddToCollection: (bookmarkId: string) => void;
  onAddNote: (bookmarkId: string) => void;
  onReviewInOrbit: (bookmarkId: string) => void;
}

export function LibraryBookmarkInspector({
  bookmark,
  onClose,
  onAddTag,
  onAddToCollection,
  onAddNote,
  onReviewInOrbit,
}: LibraryBookmarkInspectorProps) {
  const author =
    bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
  const handle = bookmark.authorUsername ? `@${bookmark.authorUsername}` : "";
  const tweetUrl = getBookmarkTweetUrl(bookmark) ?? null;

  const handleCopyLink = () => {
    if (!tweetUrl) return;
    void navigator.clipboard.writeText(tweetUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy link")
    );
  };

  return (
    <OrbitalCard className="sticky top-4 space-y-0 border-primary/20 p-0">
      <div className="flex items-center justify-between border-b border-primary/20 px-4 py-3">
        <div className={cn(orbital.label, "tracking-[0.18em] text-primary/80")}>
          LIBRARY INSPECTOR
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Close inspector"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 px-4 py-4">
        <div>
          <BookmarkPostPreview
            tweetText={bookmark.tweetText || "Bookmark"}
            authorUsername={bookmark.authorUsername}
            media={bookmark.media}
            tweetLink={{
              authorUsername: bookmark.authorUsername,
              tweetId: bookmark.tweetId,
            }}
            bookmarkKey={bookmark.id}
            variant="inline"
            textClassName={cn(
              orbital.label,
              "line-clamp-6 normal-case text-[15px] font-medium leading-tight tracking-normal text-foreground"
            )}
            galleryClassName="!mt-2"
          />
          <div
            className={cn(
              orbital.data,
              "mt-1.5 normal-case text-[11px] text-primary/60"
            )}
          >
            {author}{" "}
            {handle ? <span className="text-primary/40">{handle}</span> : null}
          </div>
        </div>

        {bookmark.publicMetrics ? (
          <div className="flex flex-wrap items-center gap-4 border-b border-hairline-soft pb-4">
            <TelemetryStat
              value={bookmark.publicMetrics.like_count?.toLocaleString() ?? "—"}
              label="Likes"
              tone="cyan"
            />
            <TelemetryStat
              value={bookmark.publicMetrics.reply_count?.toLocaleString() ?? "—"}
              label="Replies"
              tone="cyan"
            />
            <TelemetryStat
              value={bookmark.publicMetrics.retweet_count?.toLocaleString() ?? "—"}
              label="Reposts"
              tone="cyan"
            />
          </div>
        ) : null}

        <div>
          <div className={orbital.sectionLabel}>TAGS</div>
          <div className="flex flex-wrap gap-1.5">
            {bookmark.tags.length > 0 ? (
              bookmark.tags.slice(0, 6).map((t) => (
                <span key={t.tag.id} className={orbital.pill}>
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: t.tag.color }}
                  />
                  {t.tag.name}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-primary/45">No tags yet</span>
            )}
            {bookmark.tags.length > 6 ? (
              <span className={cn(orbital.pill, "text-primary/60")}>
                +{bookmark.tags.length - 6}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onAddTag(bookmark.id)}
              className="text-[11px] text-primary/50 hover:text-primary"
            >
              + add
            </button>
          </div>
        </div>

        <div>
          <div className={orbital.sectionLabel}>COLLECTIONS</div>
          <div className="flex flex-wrap gap-1.5">
            {bookmark.collectionItems.length > 0 ? (
              bookmark.collectionItems.slice(0, 4).map((c) => (
                <span
                  key={c.collection.id}
                  className={cn(
                    orbital.pill,
                    "border-bronze/30 bg-bronze/10 text-bronze"
                  )}
                >
                  {c.collection.name}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-primary/45">
                Not in a collection
              </span>
            )}
            {bookmark.collectionItems.length > 4 ? (
              <span className={cn(orbital.pill, "text-primary/60")}>
                +{bookmark.collectionItems.length - 4}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onAddToCollection(bookmark.id)}
              className="border border-dashed border-primary/30 px-2 py-0.5 text-[11px] text-primary/50 hover:border-primary/50"
            >
              + add
            </button>
          </div>
        </div>

        <div>
          <div className={orbital.sectionLabel}>ACTIONS</div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onAddTag(bookmark.id)}
              className="rounded-sm bg-primary py-2 text-sm font-medium text-[#0A0A0A] hover:bg-primary/90"
            >
              ADD TAG
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onAddToCollection(bookmark.id)}
                className="rounded-sm border border-primary/30 py-2 text-xs text-primary/80 hover:bg-primary/10"
              >
                COLLECTION
              </button>
              <button
                type="button"
                onClick={() => onReviewInOrbit(bookmark.id)}
                className="rounded-sm border border-primary/30 py-2 text-xs text-primary/80 hover:bg-primary/10"
              >
                ORBIT
              </button>
            </div>
            <button
              type="button"
              onClick={() => onAddNote(bookmark.id)}
              className="rounded-sm border border-primary/20 py-2 text-sm text-primary/70 hover:bg-accent-soft"
            >
              ADD NOTE
            </button>
          </div>

          {tweetUrl ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => openBookmarkOnX(bookmark)}
                className={cn(
                  orbital.label,
                  "inline-flex items-center gap-1 text-primary/55 hover:text-primary"
                )}
              >
                <ExternalLink className="size-3" />
                Open on X
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className={cn(
                  orbital.label,
                  "inline-flex items-center gap-1 text-primary/55 hover:text-primary"
                )}
              >
                <Link2 className="size-3" />
                Copy link
              </button>
            </div>
          ) : null}
        </div>

        <p className={cn(orbital.label, "text-primary/45")}>
          Click cards to inspect. Updates live.
        </p>
      </div>
    </OrbitalCard>
  );
}
