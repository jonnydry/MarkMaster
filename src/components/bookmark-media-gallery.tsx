"use client";

import { useState, useCallback, type MouseEvent } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { BOOKMARK_FEED_MAX_WIDTH_PX } from "@/lib/bookmark-feed-layout";
import {
  type BookmarkMediaJson,
  getMediaPosterUrl,
  getMediaTileKey,
  isVideoLikeMediaType,
} from "@/lib/bookmark-media";
import { openBookmarkOnX, type BookmarkTweetLink } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";

export type { BookmarkMediaJson as BookmarkMediaItem };

export type BookmarkMediaGalleryVariant = "feed" | "compact" | "inline";

const LAYOUT: Record<
  BookmarkMediaGalleryVariant,
  {
    maxTiles: number;
    allowInlinePlayback: boolean;
    shellClass: string;
    gridClass: (tileCount: number) => string;
    imageSizes: string;
    singleTileClass: string;
    multiTileClass: string;
    compactTileClass: string;
  }
> = {
  feed: {
    maxTiles: 4,
    allowInlinePlayback: true,
    shellClass: "mt-3 overflow-hidden rounded-sm border border-hairline-soft bg-transparent",
    gridClass: (n) => (n === 1 ? "" : "grid grid-cols-2 gap-0.5"),
    imageSizes: `(max-width: 768px) 100vw, ${BOOKMARK_FEED_MAX_WIDTH_PX}px`,
    singleTileClass: "max-h-80",
    multiTileClass: "aspect-square",
    compactTileClass: "",
  },
  inline: {
    maxTiles: 4,
    allowInlinePlayback: true,
    shellClass: "mt-3 overflow-hidden rounded-sm border border-hairline-soft bg-transparent",
    gridClass: (n) => (n === 1 ? "" : "grid grid-cols-2 gap-0.5"),
    imageSizes: "(max-width: 768px) 100vw, 460px",
    singleTileClass: "max-h-72",
    multiTileClass: "aspect-square",
    compactTileClass: "",
  },
  compact: {
    maxTiles: 1,
    allowInlinePlayback: false,
    shellClass: "shrink-0",
    gridClass: () => "",
    imageSizes: "80px",
    singleTileClass: "",
    multiTileClass: "",
    compactTileClass: "h-20 w-20 rounded-sm",
  },
};

type TileMode = "poster" | "video" | "external-cta";

interface MediaTileProps {
  item: BookmarkMediaJson;
  tileKey: string;
  index: number;
  authorUsername: string;
  layout: (typeof LAYOUT)[BookmarkMediaGalleryVariant];
  singleInGallery: boolean;
  priority?: boolean;
  imageError: Set<string>;
  onImageError: (url: string) => void;
  mode: TileMode;
  onActivate: () => void;
  showCountOverlay?: number;
}

function MediaTile({
  item,
  tileKey,
  index,
  authorUsername,
  layout,
  singleInGallery,
  priority,
  imageError,
  onImageError,
  mode,
  onActivate,
  showCountOverlay,
}: MediaTileProps) {
  const poster = getMediaPosterUrl(item);
  const isCompact = Boolean(layout.compactTileClass);
  const videoLike = isVideoLikeMediaType(item.type);

  if (mode === "video" && item.playback_url) {
    return (
      <div
        className={cn(
          "relative overflow-hidden bg-black",
          isCompact ? layout.compactTileClass : "w-full",
          !isCompact && singleInGallery && layout.singleTileClass
        )}
      >
        <video
          key={tileKey}
          src={item.playback_url}
          controls
          playsInline
          poster={poster}
          className={cn(
            "h-full w-full",
            isCompact ? "object-cover" : "object-contain",
            !isCompact && singleInGallery && layout.singleTileClass
          )}
          aria-label={`Video from @${authorUsername}`}
        />
      </div>
    );
  }

  if (mode === "external-cta") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        className={cn(
          "flex items-center justify-center rounded-sm border border-hairline-soft bg-muted/40 text-[10px] text-muted-foreground hover:bg-muted/60",
          isCompact ? layout.compactTileClass : "aspect-video w-full min-h-[120px]"
        )}
      >
        Play on X
      </button>
    );
  }

  if (!poster || imageError.has(poster)) return null;

  const imageClass = cn(
    "w-full object-cover",
    layout.compactTileClass,
    !isCompact && (singleInGallery ? layout.singleTileClass : layout.multiTileClass)
  );

  return (
    <div
      className={cn("relative", isCompact && layout.compactTileClass)}
      onClick={
        videoLike
          ? (e) => {
              e.stopPropagation();
              onActivate();
            }
          : undefined
      }
      role={videoLike ? "button" : undefined}
      tabIndex={videoLike ? 0 : undefined}
      onKeyDown={
        videoLike
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      aria-label={
        videoLike
          ? mode === "poster" && item.playback_url
            ? `Play video from @${authorUsername}`
            : `Open video on X from @${authorUsername}`
          : undefined
      }
    >
      <Image
        src={poster}
        alt={`Media ${index + 1} from @${authorUsername}`}
        width={item.width || 1200}
        height={item.height || 900}
        sizes={layout.imageSizes}
        className={imageClass}
        priority={priority && index === 0}
        onError={() => onImageError(poster)}
      />
      {videoLike && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center",
            isCompact && "rounded-sm"
          )}
          aria-hidden
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="size-4 fill-current" />
          </span>
        </div>
      )}
      {showCountOverlay != null && showCountOverlay > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white"
        >
          +{showCountOverlay}
        </div>
      )}
    </div>
  );
}

export interface BookmarkMediaGalleryProps {
  media: BookmarkMediaJson[];
  authorUsername: string;
  variant: BookmarkMediaGalleryVariant;
  /** Resets playback state when the bookmark changes. */
  bookmarkKey?: string;
  priority?: boolean;
  className?: string;
  /** When set, video without playback_url opens this tweet on X. */
  tweetLink?: BookmarkTweetLink;
  stopClickPropagation?: boolean;
}

export function BookmarkMediaGallery({
  media,
  authorUsername,
  variant,
  bookmarkKey,
  priority = false,
  className,
  tweetLink,
  stopClickPropagation = false,
}: BookmarkMediaGalleryProps) {
  const layout = LAYOUT[variant];
  const [imageError, setImageError] = useState<Set<string>>(() => new Set());
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  // Reset transient gallery state when switching to a different bookmark.
  // Adjusting state during render (rather than in an effect) avoids cascading
  // re-renders and applies synchronously before paint. See React docs:
  // "You Might Not Need an Effect" → resetting state when a prop changes.
  const [prevBookmarkKey, setPrevBookmarkKey] = useState(bookmarkKey);
  if (bookmarkKey !== prevBookmarkKey) {
    setPrevBookmarkKey(bookmarkKey);
    setPlayingKey(null);
    setImageError(new Set());
  }

  const onImageError = useCallback((url: string) => {
    setImageError((prev) => new Set(prev).add(url));
  }, []);

  const openOnX = useCallback(() => {
    if (tweetLink) openBookmarkOnX(tweetLink);
  }, [tweetLink]);

  if (!media.length || !authorUsername) return null;

  const visible = media.slice(0, layout.maxTiles);
  const extraCount = media.length - layout.maxTiles;
  const singleInGallery = visible.length === 1;

  const shellProps = stopClickPropagation
    ? {
        onClick: (e: MouseEvent) => e.stopPropagation(),
      }
    : {};

  const getMode = (item: BookmarkMediaJson, key: string): TileMode => {
    if (playingKey === key && layout.allowInlinePlayback && item.playback_url) {
      return "video";
    }
    const poster = getMediaPosterUrl(item);
    if (
      isVideoLikeMediaType(item.type) &&
      (!poster || imageError.has(poster)) &&
      tweetLink
    ) {
      return "external-cta";
    }
    return "poster";
  };

  const handleActivate = (item: BookmarkMediaJson, key: string) => {
    const videoLike = isVideoLikeMediaType(item.type);
    if (!videoLike) return;

    if (layout.allowInlinePlayback && item.playback_url) {
      setPlayingKey(key);
      return;
    }
    openOnX();
  };

  return (
    <div
      className={cn(layout.shellClass, layout.gridClass(visible.length), className)}
      {...shellProps}
    >
      {visible.map((item, i) => {
        const tileKey = getMediaTileKey(item, i);
        const isLastTile = i === visible.length - 1;
        const showCountOverlay =
          extraCount > 0 && (variant === "compact" || (layout.maxTiles > 1 && isLastTile))
            ? extraCount
            : undefined;

        return (
          <MediaTile
            key={tileKey}
            item={item}
            tileKey={tileKey}
            index={i}
            authorUsername={authorUsername}
            layout={layout}
            singleInGallery={singleInGallery}
            priority={priority}
            imageError={imageError}
            onImageError={onImageError}
            mode={getMode(item, tileKey)}
            onActivate={() => handleActivate(item, tileKey)}
            showCountOverlay={showCountOverlay}
          />
        );
      })}
    </div>
  );
}
