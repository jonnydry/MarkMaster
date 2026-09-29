import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { Agent, fetch } from "undici";

import { isPreviewablePageUrl } from "@/lib/bookmark-preview";

const PREVIEW_USER_AGENT = "Mozilla/5.0 (compatible; MarkMasterPreview/1.0)";
const HTML_BYTE_LIMIT = 512 * 1024;
const IMAGE_BYTE_LIMIT = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const PAGE_IMAGE_CACHE_LIMIT = 1_000;

const blockedRanges = new BlockList();
const ipv4Mapped = new BlockList();
const nat64WellKnown = new BlockList();
const sixToFour = new BlockList();

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedRanges.addSubnet(address, prefix, "ipv4");
}

blockedRanges.addAddress("::", "ipv6");
blockedRanges.addAddress("::1", "ipv6");
for (const [address, prefix] of [
  ["::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  // RFC 8215: this prefix is not globally reachable, and the embedded IPv4
  // position is not fixed, so the whole range is blocked.
  ["64:ff9b:1::", 48],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedRanges.addSubnet(address, prefix, "ipv6");
}

ipv4Mapped.addSubnet("::ffff:0:0", 96, "ipv6");
nat64WellKnown.addSubnet("64:ff9b::", 96, "ipv6");
sixToFour.addSubnet("2002::", 16, "ipv6");

type PageImageCacheEntry = { imageUrl: string | null; expires: number };

const pageImageCache = new Map<string, PageImageCacheEntry>();

function normalizeIpLiteral(address: string): string {
  let normalized = address.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  const zone = normalized.indexOf("%");
  if (zone !== -1) normalized = normalized.slice(0, zone);
  return normalized;
}

/** Expand a trailing dotted IPv4 tail so the address is 8 hex groups. */
function expandIpv4Tail(address: string): string {
  return address.replace(
    /:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
    (_match, a: string, b: string, c: string, d: string) => {
      const parts = [Number(a), Number(b), Number(c), Number(d)];
      if (parts.some((part) => !Number.isInteger(part) || part > 255)) return _match;
      const hi = ((parts[0] ?? 0) << 8) | (parts[1] ?? 0);
      const lo = ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
      return `:${hi.toString(16)}:${lo.toString(16)}`;
    }
  );
}

function ipv6Groups(part: string): string[] {
  if (part === "") return [];
  return part.split(":");
}

function ipv6ToBytes(address: string): Uint8Array | null {
  const expanded = expandIpv4Tail(address);
  const halves = expanded.split("::");
  if (halves.length > 2) return null;
  const left = ipv6Groups(halves[0] ?? "");
  const right = halves.length === 2 ? ipv6Groups(halves[1] ?? "") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (left.some((group) => group === "") || right.some((group) => group === "")) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index] ?? "";
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function embeddedIpv4IsBlocked(address: string, offset: number): boolean {
  const bytes = ipv6ToBytes(address);
  if (!bytes) return true;
  const ipv4 = `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`;
  return blockedRanges.check(ipv4, "ipv4");
}

/** True for loopback, link-local, private, documentation, multicast, and reserved ranges. */
export function isPrivateIp(address: string): boolean {
  const normalized = normalizeIpLiteral(address);
  const version = isIP(normalized);
  if (version === 4) return blockedRanges.check(normalized, "ipv4");
  if (version !== 6) return false;

  if (ipv4Mapped.check(normalized, "ipv6") || nat64WellKnown.check(normalized, "ipv6")) {
    return embeddedIpv4IsBlocked(normalized, 12);
  }
  if (sixToFour.check(normalized, "ipv6")) {
    return embeddedIpv4IsBlocked(normalized, 2);
  }
  return blockedRanges.check(normalized, "ipv6");
}

function blockedAddressError(): NodeJS.ErrnoException {
  const error = new Error("Blocked address") as NodeJS.ErrnoException;
  error.code = "EBLOCKED";
  return error;
}

/**
 * Resolve once and hand the socket only addresses that were checked.
 * One private answer rejects the whole set, which closes the gap between
 * the pre-check and the connection. SNI stays the hostname.
 */
const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
        callback(blockedAddressError(), []);
        return;
      }
      const checked = addresses.map((entry) => ({
        address: entry.address,
        family: entry.family,
      }));
      if (options.all) {
        callback(null, checked);
        return;
      }
      const first = checked[0];
      if (!first) {
        callback(blockedAddressError(), []);
        return;
      }
      callback(null, first.address, first.family);
    })
    .catch((error: NodeJS.ErrnoException) => {
      callback(error, []);
    });
};

const previewDispatcher = new Agent({
  connect: {
    lookup: pinnedLookup,
  },
});

function readCachedPageImage(pageUrl: string): string | null | undefined {
  const cached = pageImageCache.get(pageUrl);
  if (!cached) return undefined;
  if (cached.expires <= Date.now()) {
    pageImageCache.delete(pageUrl);
    return undefined;
  }
  pageImageCache.delete(pageUrl);
  pageImageCache.set(pageUrl, cached);
  return cached.imageUrl;
}

function writeCachedPageImage(pageUrl: string, imageUrl: string | null) {
  pageImageCache.delete(pageUrl);
  pageImageCache.set(pageUrl, {
    imageUrl,
    expires: Date.now() + (imageUrl ? SUCCESS_TTL_MS : MISS_TTL_MS),
  });
  while (pageImageCache.size > PAGE_IMAGE_CACHE_LIMIT) {
    const oldest = pageImageCache.keys().next().value;
    if (oldest === undefined) break;
    pageImageCache.delete(oldest);
  }
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

  const cached = readCachedPageImage(pageUrl);
  if (cached !== undefined) return cached;

  const page = await fetchPublic(pageUrl, "text/html,application/xhtml+xml", HTML_BYTE_LIMIT);
  const imageUrl = page
    ? extractPreviewImageFromHtml(new TextDecoder().decode(page.bytes), page.finalUrl)
    : null;
  const safeImage =
    imageUrl && (await isPublicHttpsUrl(imageUrl)) ? imageUrl : null;

  writeCachedPageImage(pageUrl, safeImage);
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
  if (url.port !== "") return false;
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
    if (current.protocol !== "https:" || current.port !== "") return null;
    if (await resolvesToPrivateAddress(current.hostname)) return null;

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(current, {
        redirect: "manual",
        dispatcher: previewDispatcher,
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
  response: { body: ReadableStream<Uint8Array> | null },
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
