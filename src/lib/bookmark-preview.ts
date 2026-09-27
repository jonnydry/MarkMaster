import { getMediaImageUrl, type BookmarkMediaJson } from "@/lib/bookmark-media";

export type ThumbnailBookmark = {
  id: string;
  media?: BookmarkMediaJson[] | null;
  urls?: unknown;
  cardUrl?: string | null;
};

type CardImage = { url: string; width?: number; height?: number };

export type CardUrlEntity = {
  url?: string;
  expanded_url?: string;
  display_url?: string;
  title?: string;
  description?: string;
  images?: CardImage[];
};

const BLOCKED_PAGE_HOST =
  /^(.*\.)?(twitter\.com|x\.com|t\.co)$|^(pic\.twitter\.com|pbs\.twimg\.com|abs\.twimg\.com|video\.twimg\.com)$/i;

export function urlEntities(urls: unknown): CardUrlEntity[] {
  if (!Array.isArray(urls)) return [];

  return urls.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];

    const images = Array.isArray(record.images)
      ? record.images.flatMap((image) => {
          const img = asRecord(image);
          if (!img || typeof img.url !== "string" || !img.url.startsWith("https://")) {
            return [];
          }
          return [
            {
              url: img.url,
              ...(typeof img.width === "number" ? { width: img.width } : {}),
              ...(typeof img.height === "number" ? { height: img.height } : {}),
            },
          ];
        })
      : undefined;

    return [
      {
        ...(typeof record.url === "string" ? { url: record.url } : {}),
        ...(typeof record.expanded_url === "string"
          ? { expanded_url: record.expanded_url }
          : {}),
        ...(typeof record.display_url === "string"
          ? { display_url: record.display_url }
          : {}),
        ...(typeof record.title === "string" ? { title: record.title } : {}),
        ...(typeof record.description === "string"
          ? { description: record.description }
          : {}),
        ...(images && images.length > 0 ? { images } : {}),
      },
    ];
  });
}

/** Twitter CDN images can render directly. Other card images go through our proxy. */
export function isTwimgUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      (url.hostname === "pbs.twimg.com" || url.hostname === "abs.twimg.com")
    );
  } catch {
    return false;
  }
}

/**
 * Pages worth fetching for an Open Graph image.
 * X's own links are login walls, and Twitter CDN hosts are images, not pages.
 */
export function isPreviewablePageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
      return false;
    }
    if (BLOCKED_PAGE_HOST.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Attached media, then a Twitter-hosted link-card image already stored on the row. */
export function directThumbnailUrl(bookmark: {
  media?: unknown;
  urls?: unknown;
}): string | undefined {
  const fromMedia = firstMediaItem(bookmark.media);
  const mediaUrl = fromMedia ? getMediaImageUrl(fromMedia) : undefined;
  if (mediaUrl) return mediaUrl;
  return bestImageUrl(bookmark.urls, isTwimgUrl);
}

export function externalCardImageUrl(urls: unknown): string | undefined {
  return bestImageUrl(urls, (url) => url.startsWith("https://") && !isTwimgUrl(url));
}

export function previewableCardPageUrl(urls: unknown): string | undefined {
  for (const entity of urlEntities(urls)) {
    if (entity.expanded_url && isPreviewablePageUrl(entity.expanded_url)) {
      return entity.expanded_url;
    }
  }
  return undefined;
}

/** Link living only on a long post, which the compact list does not send. */
export function cardPageUrlFromMetadata(metadata: unknown): string | undefined {
  const tweet = asRecord(asRecord(metadata)?.tweet);
  const noteUrls = asRecord(asRecord(tweet?.note_tweet)?.entities)?.urls;
  const fromNote = previewableCardPageUrl(noteUrls);
  if (fromNote) return fromNote;
  return previewableCardPageUrl(asRecord(tweet?.entities)?.urls);
}

export function bookmarkThumbnailPlan(bookmark: ThumbnailBookmark): {
  src: string;
  optimized: boolean;
} | null {
  const direct = directThumbnailUrl(bookmark);
  if (direct) return { src: direct, optimized: true };

  const needsProxy =
    Boolean(externalCardImageUrl(bookmark.urls)) ||
    Boolean(bookmark.cardUrl && isPreviewablePageUrl(bookmark.cardUrl));
  if (!needsProxy) return null;

  return {
    src: `/api/bookmarks/${encodeURIComponent(bookmark.id)}/card-image`,
    optimized: false,
  };
}

/** Synthetic photo so galleries can show a card image without treating it as attached media in the database. */
export function cardPreviewMedia(
  bookmark: ThumbnailBookmark
): BookmarkMediaJson[] | null {
  if (bookmark.media?.length) return null;
  const plan = bookmarkThumbnailPlan(bookmark);
  if (!plan) return null;
  return [{ type: "photo", url: plan.src, width: 1200, height: 630 }];
}

export function urlsWithCardImage(
  urls: unknown,
  pageUrl: string,
  imageUrl: string
): CardUrlEntity[] {
  const entities = urlEntities(urls);
  const image = { url: imageUrl };
  const index = entities.findIndex((entity) => entity.expanded_url === pageUrl);

  if (index >= 0) {
    const current = entities[index]!;
    if (current.images?.some((item) => item.url === imageUrl)) return entities;
    entities[index] = { ...current, images: [image, ...(current.images ?? [])] };
    return entities;
  }

  entities.push({
    url: pageUrl,
    expanded_url: pageUrl,
    display_url: displayUrlFor(pageUrl),
    images: [image],
  });
  return entities;
}

function bestImageUrl(
  urls: unknown,
  accept: (url: string) => boolean
): string | undefined {
  let best: { url: string; width: number } | undefined;
  for (const entity of urlEntities(urls)) {
    for (const image of entity.images ?? []) {
      if (!accept(image.url)) continue;
      const width = image.width ?? 0;
      if (!best || width > best.width) best = { url: image.url, width };
    }
  }
  return best?.url;
}

function displayUrlFor(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    const path = url.pathname === "/" ? "" : url.pathname;
    const text = `${url.hostname}${path}`;
    return text.length > 40 ? `${text.slice(0, 37)}…` : text;
  } catch {
    return pageUrl;
  }
}

function firstMediaItem(media: unknown): BookmarkMediaJson | undefined {
  if (!Array.isArray(media)) return undefined;
  const item = media[0];
  if (!item || typeof item !== "object") return undefined;
  const record = item as BookmarkMediaJson;
  return typeof record.type === "string" ? record : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
