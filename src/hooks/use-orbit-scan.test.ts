import { describe, expect, it } from "vitest";

import { FetchJsonError } from "@/lib/fetch-json";
import { buildOrbitScanFailure } from "@/hooks/use-orbit-scan";

describe("buildOrbitScanFailure", () => {
  it.each([
    {
      code: "xai_auth",
      kind: "auth",
      title: "xAI credentials need attention",
      message: "xAI rejected the request. Confirm your API key and model access.",
      recoveryHref: "/settings?orbitIssue=xai_auth#orbit-grok",
    },
    {
      code: "xai_model",
      kind: "model",
      title: "Configured Grok model is unavailable",
      message: "xAI could not find the configured Grok model.",
      recoveryHref: "/settings?orbitIssue=xai_model#orbit-grok",
    },
    {
      code: "xai_rate_limited",
      kind: "rate-limit",
      title: "xAI rate limit reached",
      message: "xAI rate limit reached. Try the scan again in a moment.",
      retryAfterSeconds: 45,
    },
  ] as const)("maps $code payloads to inline scan states", (payload) => {
    const failure = buildOrbitScanFailure(
      new FetchJsonError(payload.message, 502, {
        error: payload.message,
        code: payload.code,
        retryAfterSeconds: payload.retryAfterSeconds,
      }),
      "Could not scan Orbit with Grok"
    );

    expect(failure).toMatchObject({
      code: payload.code,
      kind: payload.kind,
      title: payload.title,
      message: payload.message,
      retryAfterSeconds: payload.retryAfterSeconds,
    });
    expect(failure.recoveryHref).toBe(payload.recoveryHref);
  });
});
