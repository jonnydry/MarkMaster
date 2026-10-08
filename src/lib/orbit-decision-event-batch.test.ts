import { describe, expect, it } from "vitest";

import {
  chunkDecisionEvents,
  DECISION_EVENT_BATCH_BYTE_BUDGET,
  DECISION_EVENT_BATCH_MAX_EVENTS,
  decisionEventBodyBytes,
} from "@/lib/orbit-decision-event-batch";
import type { OrbitDecisionEventPayload } from "@/types";

function event(id: string, reasoning = "scored"): OrbitDecisionEventPayload {
  return {
    bookmarkId: id,
    action: "accepted",
    source: "auto-tag",
    originalSuggestion: {
      bookmarkId: id,
      confidence: "high",
      reasoning,
      tags: [
        {
          name: "AI",
          color: "#1d9bf0",
          reason: "scored",
          reuseExisting: true,
          score: 0.9,
          origin: "jev",
        },
      ],
      collection: null,
    },
  };
}

describe("chunkDecisionEvents", () => {
  it("splits after 100 events", () => {
    const events = Array.from({ length: 101 }, (_, index) => event(`bm-${index}`));
    const batches = chunkDecisionEvents(events);

    expect(batches.map((batch) => batch.length)).toEqual([
      DECISION_EVENT_BATCH_MAX_EVENTS,
      1,
    ]);
  });

  it("starts a new batch before the body reaches 56KB", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      event(`bm-${index}`, "x".repeat(20_000))
    );
    const batches = chunkDecisionEvents(events);

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(decisionEventBodyBytes(batch)).toBeLessThan(DECISION_EVENT_BATCH_BYTE_BUDGET);
    }
    expect(batches.flat()).toHaveLength(events.length);
  });
});
