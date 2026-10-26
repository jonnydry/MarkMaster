import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/request-body";
import { parseXAppCredentialInput } from "@/lib/x-app-credentials";
import {
  sealXAppPending,
  X_APP_PENDING_COOKIE,
  xAppPendingCookieOptions,
} from "@/lib/x-app-pending";

/**
 * Store a not-yet-signed-in user's X app in an encrypted httpOnly cookie so
 * the following OAuth authorize and token exchange use that app.
 *
 * This route lives under /api/auth, which the proxy exempts from its origin
 * check (Auth.js does its own CSRF). This handler is not Auth.js, so it
 * rejects a missing or foreign Origin itself. The response never echoes the
 * secret. Nothing is written to the database until sign-in succeeds.
 */
function isBrowserSameOrigin(req: Request): boolean {
  const originHeader = req.headers.get("origin");
  if (!originHeader) return false;
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.headers.get("host");
  if (host && origin.host === host) return true;
  try {
    return origin.origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!isBrowserSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const record =
    body.data && typeof body.data === "object"
      ? (body.data as { clientId?: unknown; clientSecret?: unknown })
      : {};
  const parsed = parseXAppCredentialInput({
    clientId: record.clientId,
    clientSecret: record.clientSecret,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    X_APP_PENDING_COOKIE,
    sealXAppPending(parsed.clientId, parsed.clientSecret),
    xAppPendingCookieOptions()
  );
  return response;
}
