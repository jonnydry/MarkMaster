import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbUserMock = vi.hoisted(() => vi.fn(async () => ({ id: "user-1" })));
const checkRateLimitMock = vi.hoisted(() =>
  vi.fn(async () => ({ success: true }))
);
const createRateLimitResponseMock = vi.hoisted(() =>
  vi.fn(() => Response.json({ error: "rate limited" }, { status: 429 }))
);
const recordOrbitDecisionEventsMock = vi.hoisted(() =>
  vi.fn(async () => ({ count: 1 }))
);
const prismaMock = vi.hoisted(() => ({
  bookmark: {
    findMany: vi.fn(async () => [{ id: "bookmark-1" }]),
  },
}));

vi.mock("@/lib/auth", () => ({
  getDbUser: getDbUserMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  createRateLimitResponse: createRateLimitResponseMock,
}));

vi.mock("@/lib/orbit-decision-events", () => ({
  recordOrbitDecisionEvents: recordOrbitDecisionEventsMock,
  OrbitDecisionEventOwnershipError: class OrbitDecisionEventOwnershipError extends Error {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

function createDecisionEventsRequest(body: unknown) {
  return new NextRequest("http://localhost/api/orbit/decision-events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/orbit/decision-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbUserMock.mockResolvedValue({ id: "user-1" });
    checkRateLimitMock.mockResolvedValue({ success: true });
    recordOrbitDecisionEventsMock.mockResolvedValue({ count: 1 });
    prismaMock.bookmark.findMany.mockResolvedValue([{ id: "bookmark-1" }]);
  });

  it("records reviewed Orbit decisions for the authenticated user", async () => {
    const { POST } = await import("./route");
    const event = {
      bookmarkId: "bookmark-1",
      action: "edited",
      source: "orbit-review",
      mode: "deep",
      originalSuggestion: {
        bookmarkId: "bookmark-1",
        confidence: "high",
        reasoning: "Original suggestion",
        tags: [
          {
            name: "AI",
            color: "#1d9bf0",
            reason: "Topic",
            reuseExisting: true,
          },
        ],
        collection: null,
      },
      reviewedSuggestion: {
        bookmarkId: "bookmark-1",
        confidence: "high",
        reasoning: "Reviewed suggestion",
        tags: [
          {
            name: "Research",
            color: "#38bdf8",
            reason: "Edited",
            reuseExisting: true,
          },
        ],
        collection: null,
      },
    };

    const response = await POST(createDecisionEventsRequest({ events: [event] }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, count: 1 });
    expect(checkRateLimitMock).toHaveBeenCalledWith("api:write", "user-1");
    expect(prismaMock.bookmark.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["bookmark-1"] },
      },
      select: { id: true },
    });
    expect(recordOrbitDecisionEventsMock).toHaveBeenCalledWith({
      userId: "user-1",
      events: [event],
    });
  });

  it("rejects invalid decision event payloads before persistence", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      createDecisionEventsRequest({
        events: [{ bookmarkId: "", action: "accepted" }],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid request body");
    expect(recordOrbitDecisionEventsMock).not.toHaveBeenCalled();
  });

  it("rejects decision events for bookmarks outside the authenticated user", async () => {
    const { POST } = await import("./route");
    prismaMock.bookmark.findMany.mockResolvedValue([]);

    const response = await POST(
      createDecisionEventsRequest({
        events: [
          {
            bookmarkId: "bookmark-1",
            action: "kept",
            originalSuggestion: null,
            reviewedSuggestion: null,
          },
        ],
      })
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("One or more bookmarks could not be found.");
    expect(recordOrbitDecisionEventsMock).not.toHaveBeenCalled();
  });
});
