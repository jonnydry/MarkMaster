import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE } from "@/lib/orbit-config";
import { resetTypeSafeClientForTests } from "@/lib/typesafe";

const prismaMock = vi.hoisted(() => ({
  orbitLibraryRun: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  bookmark: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/orbit-grok", async () => {
  const { OrbitScanError } = await import("@/lib/orbit-grok-schemas");
  return { applyOrbitScanPlan: vi.fn(), OrbitScanError };
});
vi.mock("@/lib/orbit-label-examples", () => ({
  loadOrbitTagExamplesByName: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

const { runOrbitLibraryInvocation } = await import("@/lib/orbit-library-classify");

const PAGE_BUDGET_MS = 90_000;

const vocabulary = [{ name: "AI", color: "#1d9bf0" }];

function runRow() {
  return {
    id: "run-1",
    userId: "user-1",
    status: "RUNNING",
    total: 60,
    processed: 0,
    applied: 0,
    failed: 0,
    vocabulary,
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
  };
}

function posts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bm-${index}`,
    tweetText: `post ${index}`,
    media: null,
    urls: null,
    xMetadata: null,
    bookmarkedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 1_000 - index)),
  }));
}

function writes() {
  return prismaMock.orbitLibraryRun.updateMany.mock.calls.map(
    ([args]: [{ data: Record<string, unknown> }]) => args.data
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("XAI_API_KEY", "");
  resetTypeSafeClientForTests();
  prismaMock.orbitLibraryRun.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.orbitLibraryRun.findUnique.mockResolvedValue(runRow());
  prismaMock.bookmark.findMany.mockResolvedValue(
    posts(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE)
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetTypeSafeClientForTests();
});

async function settleWithinBudget(
  fetchImpl: typeof fetch
): Promise<{ continued: boolean }> {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchImpl);
  resetTypeSafeClientForTests();

  const started = Date.now();
  let elapsed = Number.POSITIVE_INFINITY;
  const pending = runOrbitLibraryInvocation("run-1").then((value) => {
    elapsed = Date.now() - started;
    return value;
  });
  await vi.advanceTimersByTimeAsync(PAGE_BUDGET_MS);
  if (!Number.isFinite(elapsed)) {
    await vi.advanceTimersByTimeAsync(ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE * 30_000);
  }
  const value = await pending;
  expect(elapsed, `brownout settled after ${elapsed}ms`).toBeLessThanOrEqual(
    PAGE_BUDGET_MS
  );
  expect(writes().some((data) => "processed" in data || "cursorId" in data)).toBe(
    false
  );
  expect(writes().at(-1)).toMatchObject({
    status: "FAILED",
    errorMessage: "TypeSafe could not be reached.",
  });
  return value;
}

describe("library auto-tag TypeSafe brownout", () => {
  it("surfaces TypeSafe could not be reached within the page budget when TypeSafe hangs", async () => {
    const result = await settleWithinBudget((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () =>
          reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    });

    expect(result).toEqual({ continued: false });
  });

  it("surfaces TypeSafe could not be reached within the page budget when TypeSafe is unreachable", async () => {
    const result = await settleWithinBudget(async () => {
      throw new TypeError("fetch failed");
    });

    expect(result).toEqual({ continued: false });
  });
});
