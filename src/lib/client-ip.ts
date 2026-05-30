/* ============================================================
   EDGE-SAFE CLIENT IP EXTRACTION
   Used by the proxy (middleware) for the coarse global rate-limit key.
   MUST NOT import Node-only modules (runs in the Edge Runtime).
   ============================================================ */

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Number of trusted reverse proxies / CDNs in front of the app, configured via
 * `TRUSTED_PROXY_HOPS`. Defaults to 1 (typical for Vercel, Cloudflare, or a
 * single nginx). Set to the real count for your deployment, or 0 if the app is
 * directly exposed (in which case `x-forwarded-for` is not trusted at all).
 */
export function getTrustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined) return DEFAULT_TRUSTED_PROXY_HOPS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TRUSTED_PROXY_HOPS;
  return parsed;
}

type HeaderLike = { get(name: string): string | null };

/**
 * Resolves the originating client IP without trusting client-spoofable hops.
 *
 * `x-forwarded-for` is a comma-separated list where each proxy appends the IP it
 * received the connection from. A client can prepend arbitrary values, so the
 * leftmost entry is NOT trustworthy. The real client IP is the entry inserted by
 * the outermost trusted proxy: counting `hops` positions in from the right.
 *
 * With the default of 1 trusted hop (Vercel/Cloudflare/single proxy) this is the
 * rightmost entry — the IP the trusted edge actually saw — which cannot be
 * spoofed by the client. Falls back to `x-real-ip`, then `"unknown"`.
 */
export function getClientIp(headers: HeaderLike): string {
  const hops = getTrustedProxyHops();

  if (hops > 0) {
    const forwardedFor = headers.get("x-forwarded-for");
    if (forwardedFor) {
      const parts = forwardedFor
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        const index = Math.max(0, parts.length - hops);
        return parts[index];
      }
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
