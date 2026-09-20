import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimitMock = vi.hoisted(() => vi.fn());
const loadMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/orbit-scan-snapshot-store", () => ({
  loadOrbitScanSnapshotForUser: loadMock,
  saveOrbitScanSnapshotForUser: saveMock,
  deleteOrbitScanSnapshotForUser: deleteMock,
}));

const payload = {
  scanRunId: "run-1",
  model: "grok-4-fast",
  scannedAt: "2026-09-19T00:00:00.000Z",
  privacy: { storeDisabled: true, zeroDataRetention: null },
  batch: {
    mode: "auto",
    profile: "balanced",
    requestedCount: 1,
    candidatePoolCount: 4,
    sharedSignalCount: 0,
    sourceUnknownCount: 0,
    sourceUnknownRate: 0,
    selectedSourceUnknownCount: 0,
    selectedSourceUnknownRate: 0,
    usefulSignalCount: 1,
    selectionReason: "test",
  },
  plan: {
    overview: {
      summary: "One bookmark",
      taggingStrategy: "reuse",
      collectionStrategy: "reuse",
    },
    suggestions: [
      {
        bookmarkId: "b1",
        confidence: "high",
        reasoning: "clear",
        tags: [{ name: "testing", color: "#fff", reason: "topic", reuseExisting: true }],
        collection: null,
      },
    ],
  },
  summary: { bookmarkCount: 1 },
  tagRollups: [],
  collectionRollups: [],
};

describe("/api/orbit/scan-snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ success: true });
  });

  it("returns the stored snapshot", async () => {
    loadMock.mockResolvedValue({
      version: 1,
      userId: "user-1",
      savedAt: "2026-09-20T00:00:00.000Z",
      payload,
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:snapshot", "user-1");
    await expect(response.json()).resolves.toMatchObject({
      snapshot: { payload: { scanRunId: "run-1" } },
    });
  });

  it("upserts a valid snapshot for the authenticated user", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("http://localhost/api/orbit/scan-snapshot", {
        method: "PUT",
        body: JSON.stringify({
          payload,
          dismissedBookmarkIds: ["b1"],
          appliedBookmarkIds: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        dismissedBookmarkIds: ["b1"],
      })
    );
  });

  it("rejects an invalid snapshot body", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(
      new NextRequest("http://localhost/api/orbit/scan-snapshot", {
        method: "PUT",
        body: JSON.stringify({ payload: { scanRunId: "nope" } }),
      })
    );

    expect(response.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("deletes the stored snapshot", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("user-1");
  });
});
