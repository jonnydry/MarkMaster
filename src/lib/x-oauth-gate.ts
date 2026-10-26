import { NextRequest, NextResponse } from "next/server";

import { readSessionDbUserId } from "./auth-edge";
import {
  isTwitterOAuthAction,
  resolveTwitterOAuthClient,
} from "./x-app-credentials";
import { X_APP_SETTINGS_PATH } from "./x-app-shared";

/**
 * Stop an X authorize/callback before Auth.js builds the request when this
 * account must not use any client. The host secret is not consulted here.
 * Auth.js sign-in from the browser expects `{ url }` when
 * `X-Auth-Return-Redirect` is set; a full-page callback gets a redirect.
 */
export async function blockTwitterOAuthIfUnconfigured(
  req: NextRequest
): Promise<Response | null> {
  if (!isTwitterOAuthAction(req.nextUrl.pathname)) return null;

  const resolved = await resolveTwitterOAuthClient(req);
  if (resolved.ok) return null;

  const sessionUserId = await readSessionDbUserId(req);
  const url = new URL(req.nextUrl.origin);
  if (resolved.reason === "settings" && sessionUserId) {
    const settings = new URL(X_APP_SETTINGS_PATH, req.nextUrl.origin);
    url.href = settings.href;
  } else if (resolved.reason === "settings") {
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("error", "XAppRequired");
  } else {
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("error", "Configuration");
  }

  if (req.headers.get("x-auth-return-redirect")) {
    return Response.json({ url: url.toString() });
  }
  return NextResponse.redirect(url);
}
