import { describe, expect, it } from "vitest";

import { FetchJsonError } from "@/lib/fetch-json";
import {
  buildOrbitScanFailure,
  removeSuggestionsFromScanPlan,
} from "@/hooks/use-orbit-scan";
import type { OrbitScanResponsePayload } from "@/types";

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

describe("removeSuggestionsFromScanPlan", () => {
  const scanPlan = {
    scanRunId: "run-1",
    model: "grok",
    scannedAt: "2026-06-08T00:00:00.000Z",
    privacy: { storeDisabled: true, zeroDataRetention: null },
    batch: {
      mode: "auto",
      profile: "quick",
      requestedCount: 2,
      candidatePoolCount: 2,
      sharedSignalCount: 0,
      sourceUnknownCount: 0,
      sourceUnknownRate: 0,
      selectedSourceUnknownCount: 0,
      selectedSourceUnknownRate: 0,
      usefulSignalCount: 2,
      selectionReason: "test",
    },
    plan: {
      overview: {
        summary: "Summary",
        taggingStrategy: "Tags",
        collectionStrategy: "Collections",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "First",
          tags: [],
          collection: null,
        },
        {
          bookmarkId: "b2",
          confidence: "medium",
          reasoning: "Second",
          tags: [],
          collection: null,
        },
      ],
    },
    summary: {
      bookmarkCount: 2,
      bookmarksWithTags: 0,
      bookmarksWithCollections: 0,
      tagAssignments: 0,
      uniqueTags: 0,
      collectionBuckets: 0,
      reusedExistingTags: 0,
      reusedExistingCollections: 0,
      newCollectionBuckets: 0,
    },
    tagRollups: [],
    collectionRollups: [],
  } satisfies OrbitScanResponsePayload;

  it("removes applied suggestions and preserves remaining scan metadata", () => {
    const next = removeSuggestionsFromScanPlan(scanPlan, ["b1"]);

    expect(next?.scanRunId).toBe("run-1");
    expect(next?.plan.suggestions.map((suggestion) => suggestion.bookmarkId)).toEqual([
      "b2",
    ]);
  });

  it("clears the plan when all suggestions are resolved", () => {
    expect(removeSuggestionsFromScanPlan(scanPlan, ["b1", "b2"])).toBeNull();
  });
});
