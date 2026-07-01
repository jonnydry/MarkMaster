import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";

// Twitter's media CDN (video.twimg.com) applies Referer-based hotlink
// protection: a cross-origin <video src> load sends the app origin as the
// Referer and the CDN responds 403. We can't set referrerPolicy on <video>
// (the HTML attribute is only valid on img/iframe/script/etc.), so instead we
// proxy the bytes through this same-origin route. A server-side fetch sends no
// browser Referer, so the CDN serves the media, and the browser request stays
// same-origin (satisfying `media-src 'self'` in the CSP).
//
// Abuse is constrained by (1) requiring an authenticated session and (2) a
// strict host allowlist so this can never act as an open proxy.

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set(["video.twimg.com", "pbs.twimg.com"]);

/** Headers worth forwarding from the upstream response to the client. */
const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
] as const;

function isAllowedUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
  return parsed;
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const upstreamUrl = isAllowedUrl(target);
  if (!upstreamUrl) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  // Forward the Range header so the browser can seek and so Safari (which
  // requires byte-range support to play <video>) works.
  const forwardHeaders: HeadersInit = {};
  const range = req.headers.get("range");
  if (range) forwardHeaders["range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: forwardHeaders,
      // Server-side fetch deliberately sends no Referer (avoids the CDN's
      // hotlink 403). Do not add one.
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  // `redirect: "follow"` means the final response may come from a different
  // host than the one we validated — re-check so an upstream redirect can
  // never turn this into an open proxy.
  if (!isAllowedUrl(upstream.url)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Upstream error" },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  // Media bytes are immutable once published; allow private caching.
  headers.set("cache-control", "private, max-age=86400");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
