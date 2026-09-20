/**
 * High-frequency, low-cost API routes that skip generic api:read/api:write
 * debits in the proxy. Specialized buckets (sync POST, orbit scan) still apply
 * in route handlers where relevant.
 */
export function isLightweightApiRequest(pathname: string, method: string): boolean {
  // Collection mutation routes apply their own api:write checks explicitly.
  const isCollectionsRoute =
    pathname === "/api/collections" || pathname.startsWith("/api/collections/");
  if (isCollectionsRoute && method !== "GET" && method !== "HEAD") {
    return true;
  }

  if (pathname.startsWith("/api/bookmarks/sync")) {
    return method === "GET" || method === "HEAD";
  }

  if (pathname.startsWith("/api/flywheel")) {
    return method === "POST";
  }

  if (pathname === "/api/orbit/library-classify") {
    // GET applies api:read in-handler; POST uses the orbit:library bucket.
    return method === "GET" || method === "HEAD" || method === "POST";
  }

  if (pathname === "/api/orbit/scan-snapshot") {
    // Handler applies the orbit:snapshot bucket for GET/PUT/DELETE.
    return (
      method === "GET" ||
      method === "HEAD" ||
      method === "PUT" ||
      method === "DELETE"
    );
  }

  // These handlers apply their own purpose-built limits. Media needs a larger
  // range-request budget; export deliberately has a tighter read limit.
  if (pathname === "/api/media" || pathname === "/api/export") {
    return method === "GET" || method === "HEAD";
  }

  return false;
}
