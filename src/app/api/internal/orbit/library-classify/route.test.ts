import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthorizedMock = vi.hoisted(() => vi.fn(() => true));
const classifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sync-queue", () => ({
  isSyncWorkerAuthorized: isAuthorizedMock,
}));

vi.mock("@/lib/orbit-library-classify", () => ({
  classifyOrbitLibraryRun: classifyMock,
}));

describe("/api/internal/orbit/library-classify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthorizedMock.mockReturnValue(true);
  });

  it("rejects unauthorized worker calls", async () => {
    isAuthorizedMock.mockReturnValueOnce(false);
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/orbit/library-classify", {
        method: "POST",
        body: JSON.stringify({ userId: "user-1" }),
      })
    );
    expect(response.status).toBe(401);
  });

  it("continues a classify run for the given user", async () => {
    classifyMock.mockResolvedValue({
      processed: 12,
      applied: 4,
      skippedReview: 8,
      remaining: 0,
      continued: false,
    });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/orbit/library-classify", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          pagesLeft: 3,
          cursor: { bookmarkedAt: "2026-01-01T00:00:00.000Z", id: "bm-1" },
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(classifyMock).toHaveBeenCalledWith({
      userId: "user-1",
      cursor: { bookmarkedAt: "2026-01-01T00:00:00.000Z", id: "bm-1" },
      pagesLeft: 3,
      continueInBackground: true,
    });
  });
});
