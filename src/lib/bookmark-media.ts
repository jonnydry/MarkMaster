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
  alt_text?: string;
  public_metrics?: {
    view_count?: number;
  };
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

function upgradeTwitterImageUrl(url: string): string {
  if (!url.includes("twimg.com")) return url;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("twimg.com")) {
      // Replace legacy `:small`/`:large`/`:orig` suffixes with a query param.
      const suffixMatch = parsed.pathname.match(/(:[a-zA-Z0-9_]+)$/);
      if (suffixMatch) {
        parsed.pathname = parsed.pathname.slice(0, -suffixMatch[1].length);
      }
      // Strip any existing size/format params so `name=orig` is the only sizing directive.
      parsed.searchParams.delete("name");
      parsed.searchParams.set("name", "orig");
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/** Image URL for rendering — optionally prefers full photo resolution in overlays. */
export function getMediaImageUrl(
  item: BookmarkMediaJson,
  options?: { preferFullSize?: boolean }
): string | undefined {
  if (options?.preferFullSize && !isVideoLikeMediaType(item.type)) {
    const raw = item.url || item.preview_image_url;
    return raw ? upgradeTwitterImageUrl(raw) : undefined;
  }

  return getMediaPosterUrl(item);
}

/** MP4 URL for inline playback when stored on the bookmark row. */
export function getMediaPlaybackUrl(item: BookmarkMediaJson): string | undefined {
  return item.playback_url;
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
      ...(m.alt_text ? { alt_text: m.alt_text } : {}),
      ...(m.public_metrics ? { public_metrics: m.public_metrics } : {}),
    };
  });
}
