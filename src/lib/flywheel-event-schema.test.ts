import { describe, expect, it } from "vitest";

import { flywheelEventSchema } from "@/lib/flywheel-event-schema";

describe("flywheelEventSchema", () => {
  it("accepts the orbit.scan.completed payload including nested metric groups", () => {
    const parsed = flywheelEventSchema.safeParse({
      eventType: "orbit.scan.completed",
      payload: {
        scanRunId: "run-1",
        durationMs: 5900,
        requestedCount: 72,
        candidatePoolCount: 160,
        profile: "sweep",
        mode: "balanced",
        usefulSuggestions: 69,
        highConfidence: 40,
        mediumConfidence: 20,
        lowConfidence: 12,
        modelAbstains: 3,
        sourceUnknowns: 0,
        safeAutoApplyCount: 31,
        signalQuality: {
          richCount: 50,
          sparseCount: 22,
          enrichmentAttempted: 12,
          enrichmentRefreshed: 10,
          enrichmentSkipped: 2,
          enrichmentFailed: null,
        },
        suggestionOutcomes: {
          reusedExistingTags: 120,
          newTags: 4,
          reusedExistingCollections: 18,
          newCollections: 1,
          abstained: 3,
        },
        hybrid: {
          firstPassLeftovers: 9,
          refinedLeftovers: 6,
          recoveredOnRefine: 3,
          escalatedToGrok: 0,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts flat payloads and null payloads", () => {
    expect(
      flywheelEventSchema.safeParse({
        eventType: "orbit.scan.failed",
        payload: { durationMs: 1200, code: "xai_auth", profile: null },
      }).success
    ).toBe(true);
    expect(
      flywheelEventSchema.safeParse({ eventType: "quick.keep", payload: null })
        .success
    ).toBe(true);
  });

  it("rejects deeper nesting and oversized payloads", () => {
    expect(
      flywheelEventSchema.safeParse({
        eventType: "orbit.scan.completed",
        payload: { nested: { deeper: { tooFar: 1 } } },
      }).success
    ).toBe(false);
    expect(
      flywheelEventSchema.safeParse({
        eventType: "orbit.scan.completed",
        payload: Object.fromEntries(
          Array.from({ length: 25 }, (_, index) => [`k${index}`, index])
        ),
      }).success
    ).toBe(false);
  });
});
