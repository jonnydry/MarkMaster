"use client";

import {
  useState,
  useCallback,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { Play } from "lucide-react";
import { BOOKMARK_FEED_MAX_WIDTH_PX } from "@/lib/bookmark-feed-layout";
import {
  type BookmarkMediaJson,
  getMediaImageUrl,
  getMediaPlaybackUrl,
  getMediaPosterUrl,
  getMediaTileKey,
  isVideoLikeMediaType,
} from "@/lib/bookmark-media";
import { openBookmarkOnX, type BookmarkTweetLink } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";

export type { BookmarkMediaJson as BookmarkMediaItem };

export type BookmarkMediaGalleryVariant = "feed" | "compact" | "inline" | "overlay";

// Expanded overlay: whole image visible, scaled to fit the scroll column.
const OVERLAY_IMAGE_MAX_HEIGHT = "min(70dvh, calc(100dvh - 14rem))";
const OVERLAY_TILE_CLASS =
  "mx-auto block h-auto w-auto max-w-full object-contain";

const LAYOUT: Record<
  BookmarkMediaGalleryVariant,
  {
    maxTiles: number;
    allowInlinePlayback: boolean;
    expandedLayout: boolean;
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
    expandedLayout: false,
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
    expandedLayout: false,
    shellClass: "mt-3 overflow-hidden rounded-sm border border-hairline-soft bg-transparent",
    gridClass: (n) => (n === 1 ? "" : "grid grid-cols-2 gap-0.5"),
    imageSizes: "(max-width: 768px) 100vw, 460px",
    singleTileClass: "max-h-72",
    multiTileClass: "aspect-square",
    compactTileClass: "",
  },
  overlay: {
    maxTiles: 4,
    allowInlinePlayback: true,
    expandedLayout: true,
    shellClass:
      "mt-3 rounded-sm border border-hairline-strong bg-black/10 supports-[backdrop-filter]:bg-black/15",
    gridClass: (n) => (n === 1 ? "" : "flex flex-col gap-2"),
    imageSizes: "(max-width: 768px) 100vw, 680px",
    singleTileClass: "",
    multiTileClass: OVERLAY_TILE_CLASS,
    compactTileClass: "",
  },
  compact: {
    maxTiles: 1,
    allowInlinePlayback: false,
    expandedLayout: false,
    shellClass: "shrink-0",
    gridClass: () => "",
    imageSizes: "80px",
    singleTileClass: "",
    multiTileClass: "",
    compactTileClass: "h-20 w-20 rounded-sm",
  },
};

type TileMode = "poster" | "video" | "external-cta";

function stopGalleryEventBubble(event: MouseEvent | PointerEvent) {
  event.stopPropagation();
}

function getTileAspectStyle(item: BookmarkMediaJson): CSSProperties | undefined {
  if (item.width && item.height && item.height > 0) {
    return { aspectRatio: `${item.width} / ${item.height}` };
  }
  return undefined;
}

function useExpandedLayout(
  layout: (typeof LAYOUT)[BookmarkMediaGalleryVariant],
  expandSingle: boolean | undefined,
  isCompact: boolean,
  singleInGallery: boolean
): boolean {
  return (
    layout.expandedLayout ||
    Boolean(!isCompact && singleInGallery && expandSingle)
  );
}

function expandedImageClass(
  layout: (typeof LAYOUT)[BookmarkMediaGalleryVariant],
  _singleInGallery: boolean
): string {
  return cn(layout.multiTileClass || OVERLAY_TILE_CLASS);
}

function GalleryImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  priority,
  expanded,
  onError,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className: string;
  priority?: boolean;
  expanded: boolean;
  onError: () => void;
}) {
  if (expanded) {
    const expandedStyle: CSSProperties = {
      display: "block",
      height: "auto",
      marginInline: "auto",
      maxHeight: OVERLAY_IMAGE_MAX_HEIGHT,
      maxWidth: "100%",
      objectFit: "contain",
      width: "auto",
    };

    return (
      // Native img avoids Next.js aspect-ratio wrapper clipping in overlay scroll.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={className}
        style={expandedStyle}
        onError={onError}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      priority={priority}
      onError={onError}
    />
  );
}

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
  /** Legacy alias — prefer variant="overlay" in expanded bookmark shells. */
  expandSingle?: boolean;
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
  expandSingle,
}: MediaTileProps) {
  const isCompact = Boolean(layout.compactTileClass);
  const expandedLayout = useExpandedLayout(
    layout,
    expandSingle,
    isCompact,
    singleInGallery
  );
  const poster = getMediaImageUrl(item, { preferFullSize: expandedLayout });
  const videoLike = isVideoLikeMediaType(item.type);
  const playbackUrl = getMediaPlaybackUrl(item);
  const isGif = item.type === "animated_gif";
  const aspectStyle = getTileAspectStyle(item);

  if (mode === "video" && playbackUrl) {
    return (
      <div
        data-media-tile={tileKey}
        className={cn(
          "relative bg-black",
          isCompact ? layout.compactTileClass : "",
          !isCompact && !expandedLayout && "w-full overflow-hidden",
          expandedLayout && "mx-auto max-w-full",
          !isCompact &&
            singleInGallery &&
            !expandedLayout &&
            layout.singleTileClass,
          !isCompact &&
            !aspectStyle &&
            !singleInGallery &&
            !expandedLayout &&
            "aspect-video",
          !isCompact &&
            !aspectStyle &&
            singleInGallery &&
            !expandedLayout &&
            "aspect-video"
        )}
        style={aspectStyle}
      >
        <video
          src={playbackUrl}
          controls
          playsInline
          preload="metadata"
          loop={isGif}
          muted={isGif}
          poster={poster}
          className={cn(
            "block size-full",
            isCompact ? "object-cover" : "object-contain"
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
          "flex items-center justify-center rounded-sm border border-hairline-soft bg-muted/40 text-2xs text-muted-foreground hover:bg-muted/60",
          isCompact ? layout.compactTileClass : "aspect-video w-full min-h-[120px]"
        )}
      >
        Play on X
      </button>
    );
  }

  if (!poster || imageError.has(poster)) return null;

  const imageClass = expandedLayout
    ? expandedImageClass(layout, singleInGallery)
    : cn(
        "w-full object-cover",
        layout.compactTileClass,
        !isCompact &&
          (singleInGallery ? layout.singleTileClass : layout.multiTileClass)
      );

  const tileWrapperClass = cn(
    "relative",
    !expandedLayout && "w-full",
    isCompact && layout.compactTileClass
  );
  const imageWidth = item.width || 1200;
  const imageHeight = item.height || 900;

  if (videoLike) {
    return (
      <button
        type="button"
        data-media-tile={tileKey}
        className={cn(
          "relative block cursor-pointer border-0 bg-transparent p-0 text-left",
          isCompact ? layout.compactTileClass : "w-full",
          expandedLayout && "mx-auto max-w-full"
        )}
        onClick={(e) => {
          stopGalleryEventBubble(e);
          onActivate();
        }}
        onPointerDown={stopGalleryEventBubble}
        aria-label={
          playbackUrl
            ? `Play video from @${authorUsername}`
            : `Open video on X from @${authorUsername}`
        }
      >
        <GalleryImage
          src={poster}
          alt=""
          width={imageWidth}
          height={imageHeight}
          sizes={layout.imageSizes}
          className={imageClass}
          priority={priority && index === 0}
          expanded={expandedLayout}
          onError={() => onImageError(poster)}
        />
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
        {showCountOverlay != null && showCountOverlay > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white"
          >
            +{showCountOverlay}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className={tileWrapperClass}>
      <GalleryImage
        src={poster}
        alt={`Media ${index + 1} from @${authorUsername}`}
        width={imageWidth}
        height={imageHeight}
        sizes={layout.imageSizes}
        className={imageClass}
        priority={priority && index === 0}
        expanded={expandedLayout}
        onError={() => onImageError(poster)}
      />
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
  /** Legacy alias — prefer variant="overlay" in expanded bookmark shells. */
  expandSingle?: boolean;
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
  expandSingle = false,
}: BookmarkMediaGalleryProps) {
  const layout = LAYOUT[variant];
  const galleryRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState<Set<string>>(() => new Set());
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  // Reset transient gallery state when switching to a different bookmark.
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

  const playMountedVideo = useCallback((item: BookmarkMediaJson, key: string) => {
    const video = galleryRef.current?.querySelector<HTMLVideoElement>(
      `[data-media-tile="${key}"] video`
    );
    if (!video) return;
    if (item.type === "animated_gif") {
      video.muted = true;
      video.loop = true;
    }
    const attemptPlay = () => {
      void video.play().catch(() => {});
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      attemptPlay();
      return;
    }
    video.addEventListener("loadeddata", attemptPlay, { once: true });
  }, []);

  if (!media.length || !authorUsername) return null;

  const visible = media.slice(0, layout.maxTiles);
  const extraCount = media.length - layout.maxTiles;
  const singleInGallery = visible.length === 1;

  const isolateClicks = stopClickPropagation || layout.allowInlinePlayback;

  const shellProps = isolateClicks
    ? {
        "data-bookmark-media-gallery": true,
        onClick: stopGalleryEventBubble,
      }
    : { "data-bookmark-media-gallery": true };

  const getMode = (item: BookmarkMediaJson, key: string): TileMode => {
    if (
      playingKey === key &&
      layout.allowInlinePlayback &&
      getMediaPlaybackUrl(item)
    ) {
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

    if (layout.allowInlinePlayback && getMediaPlaybackUrl(item)) {
      flushSync(() => setPlayingKey(key));
      playMountedVideo(item, key);
      return;
    }
    openOnX();
  };

  return (
    <div
      ref={galleryRef}
      className={cn(
        layout.shellClass,
        layout.gridClass(visible.length),
        "[content-visibility:visible]",
        className
      )}
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
            expandSingle={expandSingle}
          />
        );
      })}
    </div>
  );
}
