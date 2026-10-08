import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  ORBIT_LIBRARY_INVOCATION_BUDGET_MS,
  ORBIT_LIBRARY_LOOKAHEAD_BUDGET_MS,
  ORBIT_LIBRARY_RUN_RESUME_WINDOW_MS,
  ORBIT_LIBRARY_RUN_STALE_MS,
  ORBIT_LIBRARY_RUN_VISIBLE_AFTER_MS,
} from "@/lib/orbit-config";

const mocks = vi.hoisted(() => ({
  prisma: {
    orbitLibraryRun: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bookmark: { findMany: vi.fn(), count: vi.fn() },
    tag: { count: vi.fn() },
  },
  planLibraryAssignments: vi.fn(),
  applyOrbitScanPlan: vi.fn(),
  recordOrbitDecisionEvents: vi.fn(async () => ({ count: 0 })),
  ensureLibraryVocabulary: vi.fn(),
  requestLibraryGrowthTags: vi.fn(),
  loadOrbitTagExamplesByName: vi.fn(),
  isTypeSafeConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/orbit-library-assign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orbit-library-assign")>();
  return {
    ...actual,
    planLibraryAssignments: mocks.planLibraryAssignments,
    createPackLimiter: () => <T>(task: () => Promise<T>) => task(),
  };
});
vi.mock("@/lib/orbit-grok", async () => {
  const { OrbitScanError } = await import("@/lib/orbit-grok-schemas");
  return { applyOrbitScanPlan: mocks.applyOrbitScanPlan, OrbitScanError };
});
vi.mock("@/lib/orbit-library-vocabulary", () => ({
  ensureLibraryVocabulary: mocks.ensureLibraryVocabulary,
  requestLibraryGrowthTags: mocks.requestLibraryGrowthTags,
}));
vi.mock("@/lib/orbit-label-examples", () => ({
  loadOrbitTagExamplesByName: mocks.loadOrbitTagExamplesByName,
}));
vi.mock("@/lib/typesafe", () => ({
  isTypeSafeConfigured: mocks.isTypeSafeConfigured,
}));
vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("@/lib/orbit-decision-events", () => ({
  recordOrbitDecisionEvents: mocks.recordOrbitDecisionEvents,
}));

const {
  cancelOrbitLibraryRun,
  createOrbitLibraryRun,
  getLatestOrbitLibraryRun,
  isOrbitLibraryRunResumable,
  isOrbitLibraryRunStale,
  resumeOrbitLibraryRun,
  runOrbitLibraryInvocation,
  toOrbitLibraryRunView,
} = await import("@/lib/orbit-library-classify");
const { OrbitScanError } = await import("@/lib/orbit-grok-schemas");

const vocabulary = [{ name: "AI", color: "#1d9bf0" }];

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    userId: "user-1",
    status: "RUNNING",
    total: 60,
    processed: 0,
    applied: 0,
    failed: 0,
    vocabulary: null,
    round: 0,
    growthVocabulary: null,
    roundStartedAt: null,
    priorRoundApplied: 0,
    cursorBookmarkedAt: null,
    cursorId: null,
    errorMessage: null,
    startedAt: new Date("2026-09-24T12:00:00.000Z"),
    updatedAt: new Date("2026-09-24T12:00:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

function page(size: number, offset = 0) {
  return Array.from({ length: size }, (_, index) => ({
    id: `bm-${offset + index}`,
    tweetText: "post",
    media: null,
    xMetadata: null,
    bookmarkedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 1_000 - offset - index)),
  }));
}

function planTagging(count: number, failed = 0) {
  return {
    plan: {
      overview: { summary: "", taggingStrategy: "", collectionStrategy: "" },
      suggestions: Array.from({ length: count }, (_, index) => ({
        bookmarkId: `bm-${index}`,
        confidence: "high",
        reasoning: "",
        tags: [{ name: "AI", color: "#1d9bf0", reason: "", reuseExisting: true }],
        collection: null,
      })),
    },
    modelChecked: ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
    failed,
    scores: new Map<string, Array<{ name: string; score: number }>>(),
  };
}

function writes() {
  return mocks.prisma.orbitLibraryRun.updateMany.mock.calls.map(
    ([args]) => args.data
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // No Grok by default: a pass ends after round 0.
  vi.stubEnv("XAI_API_KEY", "");
  mocks.isTypeSafeConfigured.mockReturnValue(true);
  mocks.prisma.orbitLibraryRun.updateMany.mockResolvedValue({ count: 1 });
  mocks.ensureLibraryVocabulary.mockResolvedValue(vocabulary);
  mocks.requestLibraryGrowthTags.mockResolvedValue([]);
  mocks.loadOrbitTagExamplesByName.mockResolvedValue(new Map());
});

describe("runOrbitLibraryInvocation", () => {
  it("fixes the tag list, writes progress per page, and completes on a short page", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow());
    mocks.prisma.bookmark.findMany
      .mockResolvedValueOnce(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE))
      .mockResolvedValueOnce(page(12, ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    mocks.planLibraryAssignments
      .mockResolvedValueOnce(planTagging(30, 6))
      .mockResolvedValueOnce(planTagging(4));

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });

    expect(mocks.ensureLibraryVocabulary).toHaveBeenCalledOnce();
    expect(mocks.applyOrbitScanPlan).toHaveBeenCalledTimes(2);
    const [vocabWrite, firstPage, secondPage, finish] = writes();
    expect(vocabWrite).toMatchObject({ vocabulary });
    expect(firstPage).toMatchObject({
      processed: { increment: ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE },
      applied: { increment: 30 },
      failed: { increment: 6 },
      cursorId: `bm-${ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE - 1}`,
    });
    expect(secondPage).toMatchObject({
      processed: { increment: 12 },
      applied: { increment: 4 },
    });
    expect(finish).toMatchObject({ status: "COMPLETED", errorMessage: null });
    // The second page continues after the first page's last bookmark.
    expect(mocks.prisma.bookmark.findMany.mock.calls[1]![0].where.OR).toBeDefined();
  });

  it("records auto-tag decisions with Jev scores and still finishes when the log fails", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(3));
    const planned = planTagging(1);
    planned.scores = new Map([
      [
        "bm-0",
        [
          { name: "AI", score: 0.91 },
          { name: "Cooking", score: 0.2 },
        ],
      ],
      ["bm-1", [{ name: "Cooking", score: 0.4 }]],
    ]);
    mocks.planLibraryAssignments.mockResolvedValueOnce(planned);
    mocks.recordOrbitDecisionEvents.mockRejectedValueOnce(new Error("db down"));

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });

    const events = mocks.recordOrbitDecisionEvents.mock.calls.flatMap(
      (call) => call[0].events as Array<{
        bookmarkId: string;
        action: string;
        source: string;
        originalSuggestion: { tags: Array<{ name: string; score?: number; origin?: string }> };
        reviewedSuggestion: { tags: Array<{ name: string }> } | null;
      }>
    );
    const applied = events.find((event) => event.bookmarkId === "bm-0");
    const leftOut = events.find((event) => event.bookmarkId === "bm-1");
    expect(applied).toMatchObject({
      action: "accepted",
      source: "auto-tag",
    });
    expect(applied?.originalSuggestion.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "AI", score: 0.91, origin: "jev" }),
        expect.objectContaining({ name: "Cooking", score: 0.2, origin: "jev" }),
      ])
    );
    expect(applied?.reviewedSuggestion?.tags.map((tag) => tag.name)).toEqual(["AI"]);
    expect(leftOut).toMatchObject({
      action: "rejected",
      source: "auto-tag",
      reviewedSuggestion: null,
    });
    expect(leftOut?.originalSuggestion.tags).toEqual([
      expect.objectContaining({ name: "Cooking", score: 0.4, origin: "jev" }),
    ]);
    expect(writes().at(-1)).toMatchObject({ status: "COMPLETED", errorMessage: null });
  });

  it("writes auto-tag events in batches of at most 100", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(1));
    const scores = new Map(
      Array.from({ length: 101 }, (_, index) => [
        `bm-${index}`,
        [{ name: "AI", score: 0.9 }],
      ])
    );
    mocks.planLibraryAssignments.mockResolvedValueOnce({
      ...planTagging(0),
      scores,
    });

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });

    expect(
      mocks.recordOrbitDecisionEvents.mock.calls.map(
        (call) => (call[0].events as unknown[]).length
      )
    ).toEqual([100, 1]);
  });

  it("hands the tag list's examples to every page", async () => {
    const examples = new Map([["ai", ["An AI post"]]]);
    mocks.loadOrbitTagExamplesByName.mockResolvedValue(examples);
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(3));
    mocks.planLibraryAssignments.mockResolvedValueOnce(planTagging(1));

    await runOrbitLibraryInvocation("run-1");

    expect(mocks.loadOrbitTagExamplesByName).toHaveBeenCalledWith("user-1", ["AI"]);
    expect(mocks.planLibraryAssignments.mock.calls[0]?.[0].examples).toBe(examples);
  });

  it("skips the growth round when ORBIT_LIBRARY_GROWTH is false", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-key");
    vi.stubEnv("ORBIT_LIBRARY_GROWTH", "false");
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(12));
    mocks.planLibraryAssignments.mockResolvedValueOnce(planTagging(4));

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });

    expect(mocks.requestLibraryGrowthTags).not.toHaveBeenCalled();
    expect(writes().some((data) => data.round === 1)).toBe(false);
    expect(writes().at(-1)).toMatchObject({
      status: "COMPLETED",
      errorMessage: null,
    });
  });

  it.each(["0", "off", " false ", "OFF"])(
    "skips the growth round when ORBIT_LIBRARY_GROWTH is %j",
    async (value) => {
      vi.stubEnv("XAI_API_KEY", "xai-key");
      vi.stubEnv("ORBIT_LIBRARY_GROWTH", value);
      mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
      mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(12));
      mocks.planLibraryAssignments.mockResolvedValueOnce(planTagging(4));

      await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
        continued: false,
      });

      expect(mocks.requestLibraryGrowthTags).not.toHaveBeenCalled();
      expect(writes().some((data) => data.round === 1)).toBe(false);
      expect(writes().at(-1)).toMatchObject({
        status: "COMPLETED",
        errorMessage: null,
      });
    }
  );

  it("finishes a round-1 slice without naming tags when growth is off", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-key");
    vi.stubEnv("ORBIT_LIBRARY_GROWTH", "off");
    mocks.requestLibraryGrowthTags.mockResolvedValue([
      { name: "Rust", color: "#f97316" },
    ]);
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(
      runRow({ vocabulary, round: 1, applied: 40, processed: 60 })
    );

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });

    expect(mocks.requestLibraryGrowthTags).not.toHaveBeenCalled();
    expect(mocks.planLibraryAssignments).not.toHaveBeenCalled();
    expect(writes().at(-1)).toMatchObject({
      status: "COMPLETED",
      errorMessage: null,
    });
  });

  it("does not record a later page aborted at the slice deadline", async () => {
    vi.useFakeTimers();
    try {
      mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
      mocks.prisma.bookmark.findMany.mockResolvedValue(
        page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE)
      );
      let call = 0;
      mocks.planLibraryAssignments.mockImplementation(
        ({ signal }: { signal?: AbortSignal }) =>
          new Promise((resolve) => {
            const finish = () => resolve(planTagging(1));
            call += 1;
            if (call === 1) {
              finish();
              return;
            }
            if (signal?.aborted) finish();
            else signal?.addEventListener("abort", finish, { once: true });
          })
      );

      const pending = runOrbitLibraryInvocation("run-1");
      await vi.advanceTimersByTimeAsync(ORBIT_LIBRARY_INVOCATION_BUDGET_MS);

      await expect(pending).resolves.toEqual({ continued: true });
      expect(writes().filter((data) => "processed" in data)).toHaveLength(1);
      expect(
        writes().some((data) => data.updatedAt instanceof Date && !("processed" in data))
      ).toBe(true);
      expect(writes().some((data) => data.status === "FAILED")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records the first page when the deadline fires during it", async () => {
    vi.useFakeTimers();
    try {
      mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
      mocks.prisma.bookmark.findMany.mockResolvedValue(
        page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE)
      );
      let call = 0;
      let releaseFirst: (() => void) | undefined;
      mocks.planLibraryAssignments.mockImplementation(
        ({ signal }: { signal?: AbortSignal }) =>
          new Promise((resolve) => {
            const finish = () => resolve(planTagging(1));
            call += 1;
            if (call === 1) releaseFirst = finish;
            if (signal?.aborted) finish();
            else signal?.addEventListener("abort", finish, { once: true });
          })
      );

      const pending = runOrbitLibraryInvocation("run-1");
      await vi.advanceTimersByTimeAsync(ORBIT_LIBRARY_INVOCATION_BUDGET_MS);
      releaseFirst?.();

      await expect(pending).resolves.toEqual({ continued: true });
      const progress = writes().filter((data) => "processed" in data);
      expect(progress).toHaveLength(1);
      expect(progress[0]).toMatchObject({
        cursorId: `bm-${ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE - 1}`,
      });
      expect(
        writes().some((data) => data.updatedAt instanceof Date && !("processed" in data))
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a second round when Grok can name tags for what is left", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-key");
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(12));
    mocks.planLibraryAssignments.mockResolvedValueOnce(planTagging(4));

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: true,
    });

    expect(writes().at(-1)).toMatchObject({
      round: 1,
      cursorBookmarkedAt: null,
      cursorId: null,
    });
    expect(writes().some((data) => data.status === "COMPLETED")).toBe(false);
  });

  it("judges round 1 against only the new tags and restarts its progress", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-key");
    const growth = [{ name: "Rust", color: "#f97316" }];
    mocks.requestLibraryGrowthTags.mockResolvedValue(growth);
    mocks.prisma.bookmark.count.mockResolvedValue(20);
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(
      runRow({ vocabulary, round: 1, applied: 40, processed: 60 })
    );
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce(page(20));
    mocks.planLibraryAssignments.mockResolvedValueOnce(planTagging(5));

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });

    expect(mocks.requestLibraryGrowthTags).toHaveBeenCalledWith("user-1", vocabulary);
    const [growthWrite] = writes();
    expect(growthWrite).toMatchObject({
      growthVocabulary: growth,
      vocabulary: [...vocabulary, ...growth],
      total: 20,
      processed: 0,
      priorRoundApplied: 40,
    });
    // Round-0 failures still need a later run; the count carries over.
    expect(growthWrite).not.toHaveProperty("failed");
    expect(mocks.planLibraryAssignments.mock.calls[0]?.[0].vocabulary).toEqual(growth);
    // Round 1 is the last round.
    expect(writes().at(-1)).toMatchObject({ status: "COMPLETED" });
  });

  it("finishes without a second pass when Grok names nothing new", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-key");
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(
      runRow({ vocabulary, round: 1, applied: 40 })
    );

    await runOrbitLibraryInvocation("run-1");

    expect(mocks.planLibraryAssignments).not.toHaveBeenCalled();
    expect(writes()).toEqual([expect.objectContaining({ status: "COMPLETED" })]);
  });

  it("completes rather than fails when naming new tags errors", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-key");
    mocks.requestLibraryGrowthTags.mockRejectedValue(new Error("xai down"));
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(
      runRow({ vocabulary, round: 1, applied: 40 })
    );

    await runOrbitLibraryInvocation("run-1");

    expect(writes()).toEqual([
      expect.objectContaining({ status: "COMPLETED", errorMessage: null }),
    ]);
  });

  it("resumes from the stored cursor with the stored tag list", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(
      runRow({
        vocabulary,
        cursorBookmarkedAt: new Date("2026-01-01T00:00:00.000Z"),
        cursorId: "bm-47",
      })
    );
    mocks.prisma.bookmark.findMany.mockResolvedValueOnce([]);

    await runOrbitLibraryInvocation("run-1");

    expect(mocks.ensureLibraryVocabulary).not.toHaveBeenCalled();
    expect(mocks.prisma.bookmark.findMany.mock.calls[0]![0].where.OR).toEqual([
      { bookmarkedAt: { lt: new Date("2026-01-01T00:00:00.000Z") } },
      { bookmarkedAt: new Date("2026-01-01T00:00:00.000Z"), id: { lt: "bm-47" } },
    ]);
    expect(writes().at(-1)).toMatchObject({ status: "COMPLETED" });
  });

  it("stops quietly when the run was cancelled mid-pass", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValue(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    mocks.planLibraryAssignments.mockResolvedValue(planTagging(10));
    mocks.prisma.orbitLibraryRun.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });
    // The look-ahead page was queued but is never applied or recorded, and
    // its packs that had not started are abandoned.
    expect(mocks.applyOrbitScanPlan).toHaveBeenCalledOnce();
    expect(writes()).toHaveLength(1);
    const lookaheadSignal = mocks.planLibraryAssignments.mock.calls[1]?.[0].signal;
    expect(lookaheadSignal?.aborted).toBe(true);
  });

  it("queues the next page's packs before applying the current page", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany
      .mockResolvedValueOnce(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE))
      .mockResolvedValueOnce(page(5, ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    const order: string[] = [];
    mocks.planLibraryAssignments.mockImplementation(async ({ bookmarks }) => {
      order.push(`plan:${bookmarks.length}`);
      return planTagging(1);
    });
    mocks.applyOrbitScanPlan.mockImplementation(async () => {
      order.push("apply");
    });

    await runOrbitLibraryInvocation("run-1");

    expect(order).toEqual([
      `plan:${ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE}`,
      "plan:5",
      "apply",
      "apply",
    ]);
    // Both pages share one Jev slot pool.
    const [first, second] = mocks.planLibraryAssignments.mock.calls;
    expect(first?.[0].limiter).toBe(second?.[0].limiter);
  });

  it("applies pages in order even when a later page plans first", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany
      .mockResolvedValueOnce(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE))
      .mockResolvedValueOnce(page(5, ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    let releaseFirst!: () => void;
    mocks.planLibraryAssignments
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve(planTagging(2));
          })
      )
      .mockResolvedValueOnce(planTagging(1));

    const running = runOrbitLibraryInvocation("run-1");
    await vi.waitFor(() =>
      expect(mocks.planLibraryAssignments).toHaveBeenCalledTimes(2)
    );
    expect(mocks.applyOrbitScanPlan).not.toHaveBeenCalled();
    releaseFirst();
    await running;

    const cursors = writes()
      .filter((data) => "cursorId" in data)
      .map((data) => data.cursorId);
    expect(cursors).toEqual([
      `bm-${ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE - 1}`,
      `bm-${ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE + 4}`,
    ]);
  });

  it("stops looking ahead past the look-ahead budget but keeps paging under the slice budget", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany
      .mockResolvedValueOnce(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE))
      .mockResolvedValueOnce(page(5, ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    const order: string[] = [];
    mocks.planLibraryAssignments.mockImplementation(async ({ bookmarks }) => {
      order.push(`plan:${bookmarks.length}`);
      return planTagging(1);
    });
    mocks.applyOrbitScanPlan.mockImplementation(async () => {
      order.push("apply");
    });
    const clock = vi.fn().mockReturnValue(0);
    clock
      .mockReturnValueOnce(0) // slice start
      .mockReturnValueOnce(0) // first page
      .mockReturnValueOnce(ORBIT_LIBRARY_LOOKAHEAD_BUDGET_MS); // look-ahead check

    await expect(runOrbitLibraryInvocation("run-1", clock)).resolves.toEqual({
      continued: false,
    });

    // The second page started only after the first was applied.
    expect(order).toEqual([
      `plan:${ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE}`,
      "apply",
      "plan:5",
      "apply",
    ]);
    expect(writes().at(-1)).toMatchObject({ status: "COMPLETED" });
  });

  it("hands off to a fresh invocation once the time budget is spent", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValue(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    mocks.planLibraryAssignments.mockResolvedValue(planTagging(10));
    const clock = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(ORBIT_LIBRARY_INVOCATION_BUDGET_MS);

    await expect(runOrbitLibraryInvocation("run-1", clock)).resolves.toEqual({
      continued: true,
    });
    expect(mocks.prisma.bookmark.findMany).toHaveBeenCalledOnce();
    expect(writes().some((data) => "status" in data)).toBe(false);
  });

  it("fails the run with the provider message instead of skipping the queue", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockResolvedValue(page(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE));
    mocks.planLibraryAssignments.mockResolvedValue(
      planTagging(0, ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE)
    );

    await runOrbitLibraryInvocation("run-1");

    expect(mocks.applyOrbitScanPlan).not.toHaveBeenCalled();
    expect(writes().at(-1)).toMatchObject({
      status: "FAILED",
      errorMessage: "TypeSafe could not be reached.",
    });
  });

  it("keeps internal errors out of the stored message", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(runRow({ vocabulary }));
    mocks.prisma.bookmark.findMany.mockRejectedValue(new Error("connection reset"));

    await runOrbitLibraryInvocation("run-1");

    expect(writes().at(-1)).toMatchObject({
      status: "FAILED",
      errorMessage: "Auto-tag stopped unexpectedly.",
    });
  });

  it("ignores runs that are no longer running", async () => {
    mocks.prisma.orbitLibraryRun.findUnique.mockResolvedValue(
      runRow({ status: "CANCELLED" })
    );
    await expect(runOrbitLibraryInvocation("run-1")).resolves.toEqual({
      continued: false,
    });
    expect(mocks.prisma.bookmark.findMany).not.toHaveBeenCalled();
  });
});

describe("createOrbitLibraryRun", () => {
  it("records the starting queue size", async () => {
    mocks.prisma.bookmark.count.mockResolvedValue(3_400);
    mocks.prisma.tag.count.mockResolvedValue(18);
    mocks.prisma.orbitLibraryRun.create.mockResolvedValue(runRow({ total: 3_400 }));

    await createOrbitLibraryRun("user-1");

    expect(mocks.prisma.orbitLibraryRun.create).toHaveBeenCalledWith({
      data: { userId: "user-1", total: 3_400 },
    });
  });

  it("returns null when nothing is untagged", async () => {
    mocks.prisma.bookmark.count.mockResolvedValue(0);
    mocks.prisma.tag.count.mockResolvedValue(18);
    await expect(createOrbitLibraryRun("user-1")).resolves.toBeNull();
    expect(mocks.prisma.orbitLibraryRun.create).not.toHaveBeenCalled();
  });

  it("refuses up front when TypeSafe is not configured", async () => {
    mocks.isTypeSafeConfigured.mockReturnValue(false);
    await expect(createOrbitLibraryRun("user-1")).rejects.toMatchObject({
      code: "typesafe_auth",
    });
  });

  it("needs xAI to name tags for a library with none", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    mocks.prisma.bookmark.count.mockResolvedValue(10);
    mocks.prisma.tag.count.mockResolvedValue(0);
    await expect(createOrbitLibraryRun("user-1")).rejects.toBeInstanceOf(
      OrbitScanError
    );
    vi.unstubAllEnvs();
  });
});

describe("run views", () => {
  it("flags a running pass with no recent progress as stalled", () => {
    const updatedAt = new Date("2026-09-24T12:00:00.000Z");
    const now = updatedAt.getTime() + ORBIT_LIBRARY_RUN_STALE_MS + 1;
    expect(isOrbitLibraryRunStale({ status: "RUNNING", updatedAt }, now)).toBe(true);
    expect(isOrbitLibraryRunStale({ status: "COMPLETED", updatedAt }, now)).toBe(false);

    const view = toOrbitLibraryRunView(
      runRow({ vocabulary, processed: 48 }) as never,
      now
    );
    expect(view).toMatchObject({
      status: "running",
      processed: 48,
      vocabulary,
      stalled: true,
      startedAt: "2026-09-24T12:00:00.000Z",
    });
  });

  it("keeps a finished run visible only briefly", async () => {
    const completedAt = new Date("2026-09-24T12:10:00.000Z");
    mocks.prisma.orbitLibraryRun.findFirst.mockResolvedValue(
      runRow({ status: "COMPLETED", completedAt })
    );

    await expect(
      getLatestOrbitLibraryRun("user-1", completedAt.getTime() + 1_000)
    ).resolves.toMatchObject({ status: "COMPLETED" });
    await expect(
      getLatestOrbitLibraryRun(
        "user-1",
        completedAt.getTime() + ORBIT_LIBRARY_RUN_VISIBLE_AFTER_MS + 1
      )
    ).resolves.toBeNull();
  });
});

describe("resuming", () => {
  const failedAt = new Date("2026-09-24T12:00:00.000Z");
  const failedRun = runRow({
    status: "FAILED",
    completedAt: failedAt,
    updatedAt: failedAt,
    processed: 480,
    cursorId: "bm-479",
    errorMessage: "TypeSafe could not be reached.",
  });

  it("offers a failed run for a day, then lets the next start begin fresh", () => {
    expect(isOrbitLibraryRunResumable(failedRun as never, failedAt.getTime() + 60_000)).toBe(
      true
    );
    expect(
      isOrbitLibraryRunResumable(
        failedRun as never,
        failedAt.getTime() + ORBIT_LIBRARY_RUN_RESUME_WINDOW_MS + 1
      )
    ).toBe(false);
    expect(
      isOrbitLibraryRunResumable(
        runRow({ status: "COMPLETED", completedAt: failedAt }) as never,
        failedAt.getTime()
      )
    ).toBe(false);
  });

  it("keeps a resumable failed run visible past the finished-run window", async () => {
    mocks.prisma.orbitLibraryRun.findFirst.mockResolvedValue(failedRun);
    await expect(
      getLatestOrbitLibraryRun(
        "user-1",
        failedAt.getTime() + ORBIT_LIBRARY_RUN_VISIBLE_AFTER_MS + 60_000
      )
    ).resolves.toMatchObject({ status: "FAILED" });
  });

  it("reopens the run in place so its cursor and counts carry over", async () => {
    mocks.prisma.orbitLibraryRun.update.mockResolvedValue(runRow());
    await resumeOrbitLibraryRun("run-1");
    expect(mocks.prisma.orbitLibraryRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "RUNNING", errorMessage: null, completedAt: null },
    });
  });

  it("dismisses a failed run along with stopping a running one", async () => {
    mocks.prisma.orbitLibraryRun.findFirst.mockResolvedValue(null);
    await cancelOrbitLibraryRun("user-1");
    expect(mocks.prisma.orbitLibraryRun.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: { in: ["RUNNING", "FAILED"] } },
      data: { status: "CANCELLED", completedAt: expect.any(Date) },
    });
  });
});
