import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  ORBIT_LIBRARY_INVOCATION_BUDGET_MS,
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
  ensureLibraryVocabulary: vi.fn(),
  isTypeSafeConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/orbit-library-assign", () => ({
  planLibraryAssignments: mocks.planLibraryAssignments,
}));
vi.mock("@/lib/orbit-grok", async () => {
  const { OrbitScanError } = await import("@/lib/orbit-grok-schemas");
  return { applyOrbitScanPlan: mocks.applyOrbitScanPlan, OrbitScanError };
});
vi.mock("@/lib/orbit-library-vocabulary", () => ({
  ensureLibraryVocabulary: mocks.ensureLibraryVocabulary,
}));
vi.mock("@/lib/typesafe", () => ({
  isTypeSafeConfigured: mocks.isTypeSafeConfigured,
}));
vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

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
  };
}

function writes() {
  return mocks.prisma.orbitLibraryRun.updateMany.mock.calls.map(
    ([args]) => args.data
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isTypeSafeConfigured.mockReturnValue(true);
  mocks.prisma.orbitLibraryRun.updateMany.mockResolvedValue({ count: 1 });
  mocks.ensureLibraryVocabulary.mockResolvedValue(vocabulary);
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
    expect(mocks.prisma.bookmark.findMany).toHaveBeenCalledOnce();
    expect(writes()).toHaveLength(1);
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
