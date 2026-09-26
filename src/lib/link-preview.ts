import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isPreviewablePageUrl } from "@/lib/bookmark-preview";

const PREVIEW_USER_AGENT = "Mozilla/5.0 (compatible; MarkMasterPreview/1.0)";
const HTML_BYTE_LIMIT = 512 * 1024;
const IMAGE_BYTE_LIMIT = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;

const pageImageCache = new Map<string, { imageUrl: string | null; expires: number }>();

/** True for loopback, link-local, private, and shared-address ranges. */
export function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIp(normalized.slice("::ffff:".length));
  }

  const version = isIP(normalized);
  if (version === 4) {
    const [a, b] = normalized.split(".").map((part) => Number(part));
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (version === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    return false;
  }

  return false;
}

export function extractPreviewImageFromHtml(html: string, pageUrl: string): string | null {
  const candidates = [
    readMetaContent(html, "property", "og:image"),
    readMetaContent(html, "property", "og:image:secure_url"),
    readMetaContent(html, "name", "twitter:image"),
    readMetaContent(html, "name", "twitter:image:src"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = new URL(decodeHtml(candidate), pageUrl);
      if (resolved.protocol === "https:" && resolved.href.length <= 2048) {
        return resolved.href;
      }
    } catch {
      // Ignore malformed card images and try the next tag.
    }
  }

  return null;
}

export async function resolvePagePreviewImage(pageUrl: string): Promise<string | null> {
  if (!isPreviewablePageUrl(pageUrl)) return null;

  const cached = pageImageCache.get(pageUrl);
  if (cached && cached.expires > Date.now()) return cached.imageUrl;

  const page = await fetchPublic(pageUrl, "text/html,application/xhtml+xml", HTML_BYTE_LIMIT);
  const imageUrl = page
    ? extractPreviewImageFromHtml(new TextDecoder().decode(page.bytes), page.finalUrl)
    : null;
  const safeImage =
    imageUrl && (await isPublicHttpsUrl(imageUrl)) ? imageUrl : null;

  pageImageCache.set(pageUrl, {
    imageUrl: safeImage,
    expires: Date.now() + (safeImage ? SUCCESS_TTL_MS : MISS_TTL_MS),
  });
  return safeImage;
}

export async function fetchPreviewImage(
  imageUrl: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!(await isPublicHttpsUrl(imageUrl))) return null;
  if (isTwimgHost(imageUrl)) return null;

  const image = await fetchPublic(imageUrl, "image/avif,image/webp,image/png,image/jpeg,image/gif", IMAGE_BYTE_LIMIT);
  if (!image || image.truncated) return null;

  const contentType = sniffedImageType(image.bytes);
  if (!contentType) return null;
  return { bytes: image.bytes, contentType };
}

async function isPublicHttpsUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.href.length > 2048) return false;
  return !(await resolvesToPrivateAddress(url.hostname));
}

async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateIp(host)
  ) {
    return true;
  }

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return true;
    return addresses.some((entry) => isPrivateIp(entry.address));
  } catch {
    return true;
  }
}

async function fetchPublic(
  raw: string,
  accept: string,
  maxBytes: number
): Promise<{ bytes: Uint8Array; finalUrl: string; truncated: boolean } | null> {
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (await resolvesToPrivateAddress(current.hostname)) return null;
    if (current.protocol !== "https:") return null;

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: {
          accept,
          "user-agent": PREVIEW_USER_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current);
      } catch {
        return null;
      }
      continue;
    }

    if (!response.ok || !response.body) return null;
    const read = await readLimited(response, maxBytes);
    return { ...read, finalUrl: current.href };
  }

  return null;
}

async function readLimited(
  response: Response,
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false };

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const room = maxBytes - total;
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room));
      total += room;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

function sniffedImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function isTwimgHost(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host === "pbs.twimg.com" || host === "abs.twimg.com";
  } catch {
    return false;
  }
}

function readMetaContent(html: string, attr: "property" | "name", key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = readAttributes(tag);
    if ((attrs[attr] ?? "").toLowerCase() !== key) continue;
    const content = attrs.content?.trim();
    if (content) return content;
  }
  return null;
}

function readAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name && value !== undefined) attrs[name] = value;
  }
  return attrs;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
