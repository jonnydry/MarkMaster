"use client";

import { BookmarkMediaGallery } from "@/components/bookmark-media-gallery";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import type { BookmarkTweetLink } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";

export interface BookmarkPostPreviewProps {
  tweetText: string;
  authorUsername: string;
  media?: BookmarkMediaJson[] | null;
  tweetLink: BookmarkTweetLink;
  bookmarkKey: string;
  variant: "feed" | "compact" | "inline";
  textClassName?: string;
  priorityMedia?: boolean;
  className?: string;
  galleryClassName?: string;
  stopClickPropagation?: boolean;
  /** Render media only (text shown elsewhere). */
  mediaOnly?: boolean;
  /** Single image renders uncropped at its natural aspect (expanded overlay). */
  expandMedia?: boolean;
}

/**
 * Shared post body: text + media gallery. Use wherever a bookmark post is previewed.
 */
export function BookmarkPostPreview({
  tweetText,
  authorUsername,
  media,
  tweetLink,
  bookmarkKey,
  variant,
  textClassName,
  priorityMedia,
  className,
  galleryClassName,
  stopClickPropagation,
  mediaOnly = false,
  expandMedia = false,
}: BookmarkPostPreviewProps) {
  const hasMedia = Boolean(media?.length);

  const gallery =
    hasMedia && media ? (
      <BookmarkMediaGallery
        media={media}
        authorUsername={authorUsername}
        variant={variant === "compact" ? "compact" : variant}
        bookmarkKey={bookmarkKey}
        tweetLink={tweetLink}
        priority={priorityMedia}
        stopClickPropagation={stopClickPropagation}
        className={galleryClassName}
        expandSingle={expandMedia}
      />
    ) : null;

  if (mediaOnly) {
    return gallery;
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex min-w-0 gap-3", className)}>
        <p className={cn("min-w-0 flex-1", textClassName)}>{tweetText}</p>
        {gallery}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={textClassName}>{tweetText}</div>
      {gallery}
    </div>
  );
}
