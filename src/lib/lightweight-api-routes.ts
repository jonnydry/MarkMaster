/**
 * High-frequency, low-cost API routes that skip generic api:read/api:write
 * debits in the proxy. Specialized buckets (sync POST, orbit scan) still apply
 * in route handlers where relevant.
 */
export function isLightweightApiRequest(pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/bookmarks/sync")) {
    return method === "GET" || method === "HEAD";
  }

  if (pathname.startsWith("/api/flywheel")) {
    return method === "POST";
  }

  return false;
}
