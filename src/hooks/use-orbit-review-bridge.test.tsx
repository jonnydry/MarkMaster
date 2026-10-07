// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { useOrbitScan } from "@/hooks/use-orbit-scan";
import type { OrbitDecisionEventPayload, OrbitScanPlan } from "@/types";

const sendJson = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/fetch-json", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fetch-json")>(
    "@/lib/fetch-json"
  );
  return { ...actual, sendJson };
});

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), message: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/flywheel", () => ({
  trackFlywheelEvent: vi.fn(),
}));

import { useOrbitReviewBridge } from "@/hooks/use-orbit-review-bridge";
import { FetchJsonError } from "@/lib/fetch-json";

const BODY_LIMIT_BYTES = 64 * 1024;
const DECISION_EVENTS_PATH = "/api/orbit/decision-events";

function cjk(length: number) {
  return "書".repeat(length);
}

function suggestion(bookmarkId: string) {
  return {
    bookmarkId,
    confidence: "high" as const,
    reasoning: cjk(240),
    tags: Array.from({ length: 5 }, () => ({
      name: cjk(50),
      color: "#336699",
      reason: cjk(180),
      reuseExisting: true,
    })),
    collection: {
      name: cjk(100),
      description: cjk(240),
      reason: cjk(180),
      reuseExisting: true,
    },
  };
}

function decisionEvents(count: number): OrbitDecisionEventPayload[] {
  return Array.from({ length: count }, (_, index) => {
    const bookmarkId = `${cjk(125)}${String(index).padStart(3, "0")}`;
    return {
      bookmarkId,
      action: "edited",
      source: cjk(80),
      mode: cjk(40),
      originalSuggestion: suggestion(bookmarkId),
      reviewedSuggestion: suggestion(bookmarkId),
    };
  });
}

const emptyPlan: OrbitScanPlan = {
  overview: {
    summary: "Queue summary.",
    taggingStrategy: "Reuse tags.",
    collectionStrategy: "Reuse collections.",
  },
  suggestions: [],
};

function bodyBytes(body: unknown) {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

function decisionPosts() {
  return sendJson.mock.calls
    .filter((call) => call[0] === DECISION_EVENTS_PATH)
    .map((call) => call[1]?.body as { events: OrbitDecisionEventPayload[] });
}

async function applyReviewed(events: OrbitDecisionEventPayload[]) {
  const scan = {
    plan: { scanRunId: "run-1" },
    applyReviewedPlan: vi.fn(),
    dismiss: vi.fn(),
    dismissedBookmarkIds: new Set<string>(),
    toggleDismiss: vi.fn(),
  } as unknown as ReturnType<typeof useOrbitScan>;

  const { result } = renderHook(() =>
    useOrbitReviewBridge({
      scan,
      setActiveBookmarkId: vi.fn(),
    })
  );

  await act(async () => {
    await result.current.handleApplyReviewedPlan(emptyPlan, {
      createCollections: false,
      keptBookmarkIds: [],
      decisionEvents: events,
    });
  });
}

describe("decision event posts", () => {
  beforeEach(() => {
    sendJson.mockReset();
    sendJson.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts 72 max-length five-tag events as bodies under 64KB", async () => {
    const events = decisionEvents(72);
    expect(bodyBytes({ events })).toBeGreaterThan(BODY_LIMIT_BYTES);

    await applyReviewed(events);
    await act(async () => {
      await Promise.resolve();
    });

    const posts = decisionPosts();
    expect(posts.length).toBeGreaterThan(1);
    for (const body of posts) {
      expect(bodyBytes(body)).toBeLessThan(BODY_LIMIT_BYTES);
    }

    const delivered = posts.flatMap((body) => body.events.map((event) => event.bookmarkId));
    expect(delivered).toEqual(events.map((event) => event.bookmarkId));
  });

  it("keeps the batches that landed when one batch fails", async () => {
    vi.useFakeTimers();
    const events = decisionEvents(72);
    const poisonedId = events[20]!.bookmarkId;
    sendJson.mockImplementation(async (_url: string, init?: { body?: { events?: OrbitDecisionEventPayload[] } }) => {
      const ids = init?.body?.events?.map((event) => event.bookmarkId) ?? [];
      if (ids.includes(poisonedId)) {
        throw new Error("Request body is too large");
      }
    });

    await applyReviewed(events);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const posts = decisionPosts();
    const failed = posts.filter((body) =>
      body.events.some((event) => event.bookmarkId === poisonedId)
    );
    const landed = posts.filter((body) =>
      body.events.every((event) => event.bookmarkId !== poisonedId)
    );

    expect(failed).toHaveLength(3);
    const failedIds = failed[0]!.events.map((event) => event.bookmarkId);
    expect(failed.map((body) => body.events.map((event) => event.bookmarkId))).toEqual([
      failedIds,
      failedIds,
      failedIds,
    ]);

    const landedIds = landed.flatMap((body) => body.events.map((event) => event.bookmarkId));
    expect(new Set(landedIds).size).toBe(landedIds.length);
    expect(landedIds.filter((id) => failedIds.includes(id))).toEqual([]);
    expect(landedIds.slice().sort()).toEqual(
      events
        .map((event) => event.bookmarkId)
        .filter((id) => !failedIds.includes(id))
        .sort()
    );
    expect(landedIds.length).toBeGreaterThan(0);
    expect(failedIds.length).toBeGreaterThan(0);
    expect(landedIds.length + failedIds.length).toBe(events.length);
  });

  it("does not retry a 413", async () => {
    vi.useFakeTimers();
    sendJson.mockRejectedValue(
      new FetchJsonError("Request body is too large", 413, null)
    );

    await applyReviewed([{ bookmarkId: "bookmark-1", action: "kept" }]);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(decisionPosts()).toHaveLength(1);
  });

  it("retries a 429", async () => {
    vi.useFakeTimers();
    sendJson.mockRejectedValue(new FetchJsonError("Rate limit exceeded", 429, null));

    await applyReviewed([{ bookmarkId: "bookmark-1", action: "kept" }]);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(decisionPosts()).toHaveLength(3);
  });
});
