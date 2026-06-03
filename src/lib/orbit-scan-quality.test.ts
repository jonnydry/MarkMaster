import { describe, expect, it } from "vitest";

import { evaluateOrbitScanQuality } from "./orbit-scan-quality";

function completed(payload: Record<string, number | string>) {
  return { eventType: "orbit.scan.completed", payload };
}

function failed(payload: Record<string, number | string>) {
  return { eventType: "orbit.scan.failed", payload };
}

describe("evaluateOrbitScanQuality", () => {
  it("uses Quick and locks Deep when there is no scan history", () => {
    const quality = evaluateOrbitScanQuality({ scanEvents: [] });

    expect(quality.recommendedProfile).toBe("quick");
    expect(quality.successfulScanCount).toBe(0);
    expect(quality.deep.unlocked).toBe(false);
  });

  it("recommends Balanced when recent scans are fast and useful", () => {
    const quality = evaluateOrbitScanQuality({
      scanEvents: [
        completed({
          requestedCount: 24,
          durationMs: 30_000,
          usefulSuggestions: 18,
          modelAbstains: 4,
        }),
        completed({
          requestedCount: 24,
          durationMs: 35_000,
          usefulSuggestions: 17,
          modelAbstains: 5,
        }),
        completed({
          requestedCount: 12,
          durationMs: 20_000,
          usefulSuggestions: 9,
          modelAbstains: 2,
        }),
      ],
    });

    expect(quality.recommendedProfile).toBe("balanced");
    expect(quality.usefulSuggestionRate).toBeGreaterThanOrEqual(0.65);
    expect(quality.modelAbstainRate).toBeLessThanOrEqual(0.35);
    expect(quality.deep.unlocked).toBe(false);
  });

  it("unlocks Deep after strong large-batch scan and review history", () => {
    const quality = evaluateOrbitScanQuality({
      scanEvents: Array.from({ length: 5 }, () =>
        completed({
          requestedCount: 24,
          durationMs: 42_000,
          usefulSuggestions: 19,
          modelAbstains: 4,
        })
      ),
      reviewEvents: [
        {
          payload: {
            accepted: 7,
            edited: 3,
            kept: 2,
            rejected: 0,
          },
        },
      ],
    });

    expect(quality.deep.unlocked).toBe(true);
    expect(quality.deep.reason).toBe("Deep batches are available.");
  });

  it("keeps Deep locked when failures or abstains are too high", () => {
    const quality = evaluateOrbitScanQuality({
      scanEvents: [
        failed({ requestedCount: 24, durationMs: 10_000 }),
        ...Array.from({ length: 5 }, () =>
          completed({
            requestedCount: 24,
            durationMs: 42_000,
            usefulSuggestions: 13,
            modelAbstains: 8,
          })
        ),
      ],
    });

    expect(quality.recommendedProfile).toBe("quick");
    expect(quality.deep.unlocked).toBe(false);
  });
});
