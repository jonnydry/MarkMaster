import "server-only";

import { TypeSafeClient } from "@typesafe-ai/sdk";

const DEFAULT_TYPESAFE_MODEL = "jev-latest";

export function isTypeSafeConfigured() {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export function getTypeSafeModel() {
  return process.env.TYPESAFE_DEFAULT_MODEL?.trim() || DEFAULT_TYPESAFE_MODEL;
}

export function getTypeSafeModelSource(): "default" | "environment" {
  return process.env.TYPESAFE_DEFAULT_MODEL?.trim() ? "environment" : "default";
}

/**
 * The client owns retries (429, 5xx, timeouts, dropped connections) so Orbit
 * code does not stack its own loop on top. Retry-After waits are capped well
 * below the SDK's 60 s default so one throttled call cannot stall a scan;
 * longer server hints fall back to the client's own backoff.
 */
export const TYPESAFE_RETRY = {
  maxRetries: 2,
  maxRetryAfterMs: 10_000,
} as const;

/** Per-attempt timeout for a single-bookmark judgment. */
export const TYPESAFE_TIMEOUT_MS = 15_000;

let client: TypeSafeClient | undefined;

export function getTypeSafeClient() {
  if (!isTypeSafeConfigured()) {
    throw new Error("TYPESAFE_API_KEY is not set.");
  }
  if (!client) {
    client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY?.trim(),
      defaultModel: getTypeSafeModel(),
      logLevel: "warn",
      retry: TYPESAFE_RETRY,
      timeout: TYPESAFE_TIMEOUT_MS,
    });
  }
  return client;
}

/** Test-only: drop the lazy client after env changes. */
export function resetTypeSafeClientForTests() {
  client = undefined;
}
