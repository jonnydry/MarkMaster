import { NextResponse } from "next/server";

type DebugUser = { id: string };

/**
 * Gatekeeper for internal debug/admin API surfaces.
 *
 * Returns a NextResponse to return immediately when access is denied, or null
 * when the caller is allowed to proceed.
 *
 * - Production: fail-CLOSED. `OWNER_USER_ID` must be set AND match the current
 *   user. Otherwise we return a generic 404 so the endpoint's existence is not
 *   advertised to authenticated non-owners (and a missing env var can never
 *   accidentally expose the tool).
 * - Non-production: if `OWNER_USER_ID` is set, restrict to that user (403);
 *   otherwise allow any authenticated user (convenient for local dev).
 *
 * Callers must already have authenticated the user (401) before calling this.
 */
export function debugAccessDeniedResponse(user: DebugUser): NextResponse | null {
  const ownerUserId = process.env.OWNER_USER_ID?.trim();

  if (process.env.NODE_ENV === "production") {
    if (!ownerUserId || user.id !== ownerUserId) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    return null;
  }

  if (ownerUserId && user.id !== ownerUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
