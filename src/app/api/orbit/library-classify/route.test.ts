import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbUserMock = vi.hoisted(() => vi.fn(async () => ({ id: "user-1" })));
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const classifyMock = vi.hoisted(() => vi.fn());
const kickMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getDbUser: getDbUserMock,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: checkRateLimitMock,
  };
});

const countQueueMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orbit-library-classify", () => ({
  classifyOrbitLibraryRun: classifyMock,
  countOrbitLibraryQueue: countQueueMock,
  kickOrbitLibraryClassifyWorker: kickMock,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      void fn();
    },
  };
});

describe("/api/orbit/library-classify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({
      success: true,
      limit: 24,
      remaining: 23,
      reset: Date.now() + 1000,
    });
  });

  it("returns unauthorized without a session", async () => {
    getDbUserMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("returns the untagged queue count", async () => {
    countQueueMock.mockResolvedValueOnce(1234);
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ untaggedCount: 1234 });
  });

  it("classifies a run and kicks the worker when more remain", async () => {
    classifyMock.mockResolvedValue({
      processed: 192,
      applied: 40,
      skippedReview: 152,
      remaining: 9800,
      continued: true,
      pagesLeft: 396,
      cursor: { bookmarkedAt: "2026-01-01T00:00:00.000Z", id: "bm-192" },
    });
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      processed: 192,
      applied: 40,
      remaining: 9800,
      continued: true,
    });
    expect(kickMock).toHaveBeenCalledWith({
      userId: "user-1",
      cursor: { bookmarkedAt: "2026-01-01T00:00:00.000Z", id: "bm-192" },
      pagesLeft: 396,
    });
  });

  it("surfaces TypeSafe configuration failures", async () => {
    const { OrbitGrokError } = await import("@/lib/orbit-grok");
    classifyMock.mockRejectedValueOnce(
      new OrbitGrokError(
        "Set TYPESAFE_API_KEY before classifying the Orbit library.",
        503,
        "typesafe_auth"
      )
    );
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "typesafe_auth",
    });
  });
});
