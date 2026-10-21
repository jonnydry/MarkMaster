import { isIP } from "node:net";

/** HTTPS hosts the image backfill may fetch. Exact host only, no subdomains. */
export const IMAGE_FETCH_HOSTS = ["pbs.twimg.com", "video.twimg.com", "ton.twimg.com"] as const;

const IMAGE_FETCH_HOST_SET = new Set<string>(IMAGE_FETCH_HOSTS);

/** Redirect hops followed after the first response. Each hop is allowlisted before it is fetched. */
export const IMAGE_FETCH_MAX_REDIRECTS = 3;

/**
 * True for https URLs on {@link IMAGE_FETCH_HOSTS} with no userinfo, no non-default port,
 * and no IP literal. Hostnames are not resolved: a name that is not on the list is refused.
 */
export function isAllowlistedImageUrl(raw: string): boolean {
  if (raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) return false;
  return IMAGE_FETCH_HOST_SET.has(host);
}
