import type { Instrumentation } from "next";

import { logError } from "@/lib/logger";

/**
 * Central server-error hook: every uncaught error from Server Components,
 * Route Handlers, Server Actions, and the proxy lands here. This is the
 * single integration point for an external error reporter (e.g. Sentry's
 * captureRequestError) — until one is wired up, errors flow through the
 * redacting logger so they are searchable in platform logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest: unknown }).digest)
      : undefined;

  logError(
    "RequestError",
    `${request.method} ${request.path} — ${context.routerKind} ${context.routeType} ${context.routePath}${digest ? ` (digest ${digest})` : ""}`,
    err
  );
};
