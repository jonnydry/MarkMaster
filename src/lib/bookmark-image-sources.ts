import { createHash } from "node:crypto";

import { isVideoLikeMediaType, type BookmarkMediaJson } from "@/lib/bookmark-media";
import { isAllowlistedImageUrl } from "@/lib/image-fetch-allowlist";

/** Bump to re-embed the same URL after the image recipe changes. */
export const IMAGE_SOURCE_HASH_VERSION = "image-v2";

export type BookmarkImageSource = {
  /** The image URL. One row per bookmark, URL, model, and dimension. */
  mediaKey: string;
  url: string;
  contentHash: string;
};

export function imageContentHash(url: string): string {
  return createHash("sha256").update(`${IMAGE_SOURCE_HASH_VERSION}\0${url}`).digest("hex");
}

/**
 * Photos use the image URL. Videos and GIFs use the thumbnail, never the MP4.
 * Link-card images on `urls` are included when they are on the image-fetch allowlist.
 * The same URL is kept once. Other hosts are dropped and never fetched.
 */
export function selectBookmarkImageSources(bookmark: {
  media?: unknown;
  urls?: unknown;
}): BookmarkImageSource[] {
  const seen = new Set<string>();
  const sources: BookmarkImageSource[] = [];

  const push = (candidate: string | undefined) => {
    if (!candidate || seen.has(candidate) || !isAllowlistedImageUrl(candidate)) return;
    seen.add(candidate);
    sources.push({
      mediaKey: candidate,
      url: candidate,
      contentHash: imageContentHash(candidate),
    });
  };

  for (const item of asMedia(bookmark.media)) {
    push(imageUrlForMediaItem(item));
  }

  for (const entity of asArray(bookmark.urls)) {
    const images = asRecord(entity)?.images;
    for (const image of asArray(images)) {
      const url = asRecord(image)?.url;
      if (typeof url === "string") push(url);
    }
  }

  return sources;
}

function imageUrlForMediaItem(item: BookmarkMediaJson): string | undefined {
  if (isVideoLikeMediaType(item.type)) {
    return firstImageUrl([item.preview_image_url, item.url], true);
  }
  return firstImageUrl([item.url, item.preview_image_url], false);
}

function firstImageUrl(candidates: Array<string | undefined>, video: boolean): string | undefined {
  for (const candidate of candidates) {
    if (!candidate || !isAllowlistedImageUrl(candidate)) continue;
    if (video && isVideoFileUrl(candidate)) continue;
    return candidate;
  }
  return undefined;
}

function isVideoFileUrl(value: string): boolean {
  try {
    return /\.(mp4|m3u8|webm|mov)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function asMedia(value: unknown): BookmarkMediaJson[] {
  return asArray(value).flatMap((item) => {
    const record = asRecord(item);
    if (!record || typeof record.type !== "string") return [];
    return [record as BookmarkMediaJson];
  });
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
