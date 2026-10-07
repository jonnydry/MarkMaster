import { describe, expect, it } from "vitest";

import {
  formatLibraryRunEta,
  libraryRunDetail,
  libraryRunOutcome,
  libraryRunProgress,
  libraryRunRemainingMs,
} from "@/hooks/use-orbit-library-tag";
import type { OrbitLibraryRunView } from "@/types";

function run(overrides: Partial<OrbitLibraryRunView> = {}): OrbitLibraryRunView {
  return {
    id: "run-1",
    status: "running",
    total: 1_000,
    processed: 0,
    applied: 0,
    failed: 0,
    vocabulary: [{ name: "AI", color: "#1d9bf0" }],
    round: 0,
    newTags: null,
    priorRoundApplied: 0,
    roundStartedAt: "2026-09-24T12:00:00.000Z",
    errorMessage: null,
    startedAt: "2026-09-24T12:00:00.000Z",
    updatedAt: "2026-09-24T12:00:00.000Z",
    completedAt: null,
    stalled: false,
    ...overrides,
  };
}

describe("libraryRunProgress", () => {
  it("is the checked share of the starting queue", () => {
    expect(libraryRunProgress(run({ processed: 250 }))).toBe(0.25);
  });

  it("fills once the run completes even if the queue shrank underneath it", () => {
    expect(
      libraryRunProgress(run({ status: "completed", processed: 900 }))
    ).toBe(1);
  });

  it("has no meter without a run or a count", () => {
    expect(libraryRunProgress(null)).toBeNull();
    expect(libraryRunProgress(run({ total: 0 }))).toBeNull();
  });
});

describe("libraryRunRemainingMs", () => {
  it("projects the pace so far over what is left", () => {
    // 200 checked in 60 s → 800 left takes 240 s.
    const remaining = libraryRunRemainingMs(
      run({ processed: 200, updatedAt: "2026-09-24T12:01:00.000Z" })
    );
    expect(remaining).toBe(240_000);
    expect(formatLibraryRunEta(remaining!)).toBe("about 4 min left");
  });

  it("waits for a full page before guessing", () => {
    expect(
      libraryRunRemainingMs(
        run({ processed: 10, updatedAt: "2026-09-24T12:00:05.000Z" })
      )
    ).toBeNull();
  });

  it("has no estimate while the run is stalled", () => {
    expect(
      libraryRunRemainingMs(
        run({
          processed: 200,
          updatedAt: "2026-09-24T12:01:00.000Z",
          stalled: true,
        })
      )
    ).toBeNull();
  });
});

describe("formatLibraryRunEta", () => {
  it("rounds to plain language", () => {
    expect(formatLibraryRunEta(20_000)).toBe("under a minute left");
    expect(formatLibraryRunEta(90 * 60_000)).toBe("about 1.5 hr left");
  });
});

describe("libraryRunDetail", () => {
  it("names the preparation step before the tag list exists", () => {
    expect(libraryRunDetail(run({ vocabulary: null }))).toBe(
      "Getting the tag list ready…"
    );
  });

  it("reports checked and tagged counts with an estimate", () => {
    expect(
      libraryRunDetail(
        run({
          processed: 200,
          applied: 150,
          updatedAt: "2026-09-24T12:01:00.000Z",
        })
      )
    ).toBe("200 of 1,000 checked · 150 tagged · about 4 min left");
  });

  it("keeps the failure reason and offers a resume", () => {
    expect(
      libraryRunDetail(
        run({
          status: "failed",
          processed: 480,
          errorMessage: "TypeSafe could not be reached.",
        })
      )
    ).toBe(
      "TypeSafe could not be reached. Stopped at 480 of 1,000; Resume picks up where it left off."
    );
  });

  it("offers a resume when the worker stopped", () => {
    expect(libraryRunDetail(run({ processed: 480, stalled: true }))).toBe(
      "Stopped responding at 480 of 1,000. Resume picks up where it left off."
    );
  });
});

describe("libraryRunOutcome", () => {
  it("summarizes tagged, unmatched, and failed posts", () => {
    expect(
      libraryRunOutcome(
        run({ status: "completed", processed: 1_000, applied: 700, failed: 12 })
      )
    ).toEqual({
      tone: "success",
      message:
        "Tagged 700 bookmarks. 288 had no confident match and stay in Orbit. 12 couldn't be checked; run auto-tag again to retry them.",
    });
  });

  it("points at Scan when nothing matched", () => {
    expect(
      libraryRunOutcome(run({ status: "completed", processed: 40 }))
    ).toMatchObject({ tone: "info" });
  });

  it("reports progress kept after a stop", () => {
    expect(
      libraryRunOutcome(run({ status: "cancelled", applied: 1 }))
    ).toEqual({ tone: "info", message: "Auto-tag stopped. 1 bookmark tagged so far." });
  });

  it("shows the stored error for a failed run", () => {
    expect(
      libraryRunOutcome(
        run({ status: "failed", errorMessage: "TypeSafe could not be reached." })
      )
    ).toEqual({ tone: "error", message: "TypeSafe could not be reached." });
  });
});

describe("library run round 1", () => {
  const newTags = [
    { name: "Rust", color: "#f97316" },
    { name: "Sourdough", color: "#a16207" },
  ];

  it("says it is naming new tags before they exist", () => {
    expect(libraryRunDetail(run({ round: 1, applied: 300, processed: 1_000 }))).toBe(
      "300 tagged · Naming new tags for posts nothing fit…"
    );
    expect(libraryRunRemainingMs(run({ round: 1, processed: 1_000 }))).toBeNull();
  });

  it("reports the second pass against the new tags", () => {
    expect(
      libraryRunDetail(
        run({ round: 1, newTags, total: 400, processed: 100, applied: 320, priorRoundApplied: 300 })
      )
    ).toMatch(/^100 of 400 checked with 2 new tags · 320 tagged/);
  });

  it("measures the ETA from the round's start", () => {
    // 100 checked in 60 s of round 1 → 300 left takes 180 s.
    const remaining = libraryRunRemainingMs(
      run({
        round: 1,
        newTags,
        total: 400,
        processed: 100,
        roundStartedAt: "2026-09-24T13:00:00.000Z",
        updatedAt: "2026-09-24T13:01:00.000Z",
      })
    );
    expect(remaining).toBe(180_000);
  });

  it("credits the new tags and counts what is still untagged from round 1", () => {
    const outcome = libraryRunOutcome(
      run({
        status: "completed",
        round: 1,
        newTags,
        total: 400,
        processed: 400,
        applied: 360,
        priorRoundApplied: 300,
        failed: 10,
      })
    );
    expect(outcome.message).toBe(
      "Tagged 360 bookmarks. 60 took one of 2 new tags. 330 had no confident match and stay in Orbit. 10 couldn't be checked; run auto-tag again to retry them."
    );
  });
});
