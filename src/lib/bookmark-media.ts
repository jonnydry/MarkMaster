import type { XMedia } from "./x-api";

/** JSON shape stored on `Bookmark.media` and used in UI. */
export type BookmarkMediaJson = {
  type: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  playback_url?: string;
  duration_ms?: number;
};

export function isVideoLikeMediaType(type: string): boolean {
  return type === "video" || type === "animated_gif";
}

export function hasVideoLikeMedia(
  media: BookmarkMediaJson[] | null | undefined
): boolean {
  return Boolean(media?.some((m) => isVideoLikeMediaType(m.type)));
}

export function getMediaPosterUrl(item: BookmarkMediaJson): string | undefined {
  return item.preview_image_url || item.url;
}

export function getMediaTileKey(item: BookmarkMediaJson, index: number): string {
  return item.playback_url ?? getMediaPosterUrl(item) ?? `${item.type}-${index}`;
}

/** Highest-bitrate MP4 variant for inline playback. */
export function pickBestMp4Variant(media: XMedia): string | undefined {
  const variants = media.variants;
  if (!variants?.length) return undefined;

  let best: { url: string; bit_rate: number } | undefined;
  for (const v of variants) {
    if (v.content_type !== "video/mp4" || !v.url) continue;
    const bitRate = v.bit_rate ?? 0;
    if (!best || bitRate > best.bit_rate) {
      best = { url: v.url, bit_rate: bitRate };
    }
  }
  return best?.url;
}

/** Maps X API media into the JSON shape stored on Bookmark.media. */
export function mapStoredBookmarkMedia(media: XMedia[]): BookmarkMediaJson[] {
  return media.map((m) => {
    const playback_url = pickBestMp4Variant(m);
    const videoLike = isVideoLikeMediaType(m.type);
    return {
      type: m.type,
      url: videoLike
        ? m.preview_image_url ?? m.url
        : m.url || m.preview_image_url,
      preview_image_url: m.preview_image_url,
      width: m.width,
      height: m.height,
      ...(playback_url ? { playback_url } : {}),
      ...(m.duration_ms != null ? { duration_ms: m.duration_ms } : {}),
    };
  });
}
