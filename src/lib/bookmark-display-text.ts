import { hasVideoLikeMedia, type BookmarkMediaJson } from "@/lib/bookmark-media";

const TCO_URL = /https?:\/\/t\.co\/[A-Za-z0-9]+/gi;

type BookmarkUrlEntity = {
  url?: string;
  expanded_url?: string;
  display_url?: string;
  title?: string;
};

type BookmarkDisplayTextSource = {
  tweetText: string;
  authorUsername?: string | null;
  media?: BookmarkMediaJson[] | null;
  urls?: unknown;
};

/** True when the body is empty or only t.co short links (common media-only saves). */
export function isTcoOnlyTweetText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const remainder = trimmed.replace(TCO_URL, "").replace(/\s+/g, "");
  return remainder.length === 0;
}

function asUrlEntities(urls: unknown): BookmarkUrlEntity[] {
  if (!Array.isArray(urls)) return [];
  return urls.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [
      {
        url: typeof record.url === "string" ? record.url : undefined,
        expanded_url:
          typeof record.expanded_url === "string" ? record.expanded_url : undefined,
        display_url:
          typeof record.display_url === "string" ? record.display_url : undefined,
        title: typeof record.title === "string" ? record.title : undefined,
      },
    ];
  });
}

function hostnameFromExpanded(expanded: string): string | null {
  try {
    const host = new URL(expanded).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function labelFromEntity(entity: BookmarkUrlEntity): { title: string | null; host: string | null } {
  const title = entity.title?.trim() || null;
  const display = entity.display_url?.trim() || null;
  const expanded = entity.expanded_url?.trim();
  const host = display || (expanded ? hostnameFromExpanded(expanded) : null);
  return { title, host };
}

function isMediaShortLink(label: string): boolean {
  return /^pic\.x\.com\b/i.test(label);
}

function entityMatchesToken(entity: BookmarkUrlEntity, token: string): boolean {
  const short = entity.url?.trim();
  if (!short) return false;
  return short === token || short.endsWith(token.replace(/^https?:\/\//, ""));
}

/** Title or host for a t.co token, using only the stored entity that matches it. */
function pickStoredLinkLabel(
  tweetText: string,
  urls: unknown
): { title: string | null; host: string | null } {
  const tokens = tweetText.match(TCO_URL) ?? [];
  if (tokens.length === 0) return { title: null, host: null };
  const entities = asUrlEntities(urls);
  for (const token of tokens) {
    const entity = entities.find((candidate) => entityMatchesToken(candidate, token));
    if (!entity) continue;
    const label = labelFromEntity(entity);
    if (label.title || (label.host && !isMediaShortLink(label.host))) return label;
  }
  return { title: null, host: null };
}

/**
 * Card/list title for a bookmark. Leaves mixed captions alone. t.co-only
 * bodies prefer a stored link title or host, then "Photo/Video/Post by @author".
 */
export function formatBookmarkDisplayText(
  bookmark: BookmarkDisplayTextSource
): string {
  const text = bookmark.tweetText.trim();
  if (!isTcoOnlyTweetText(text)) return text;

  const stored = pickStoredLinkLabel(text, bookmark.urls);
  if (stored.title) return stored.title;
  if (!bookmark.media?.length && stored.host) return stored.host;

  const handle = bookmark.authorUsername?.replace(/^@/, "").trim();
  const kind = hasVideoLikeMedia(bookmark.media)
    ? "Video"
    : bookmark.media?.length
      ? "Photo"
      : "Post";

  return handle ? `${kind} by @${handle}` : kind;
}
