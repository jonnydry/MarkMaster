import { beforeEach, describe, expect, it, vi } from "vitest";

const kickSyncWorkerMock = vi.hoisted(() => vi.fn());
const enqueueSyncRunMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/sync-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync-queue")>();
  return {
    ...actual,
    enqueueSyncRun: enqueueSyncRunMock,
    kickSyncWorker: kickSyncWorkerMock,
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: true })),
  checkGlobalRateLimit: vi.fn(async () => ({ success: true })),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      void callback();
    },
  };
});

describe("/api/bookmarks/sync POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueSyncRunMock.mockResolvedValue({ created: { id: "run-1" } });
    kickSyncWorkerMock.mockResolvedValue(undefined);
  });

  it("accepts sync with 202 and dispatches the background worker", async () => {
    const { POST } = await import("./route");

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toEqual({
      runId: "run-1",
      status: "PENDING",
      accepted: true,
    });
    expect(enqueueSyncRunMock).toHaveBeenCalledWith("user-1");
    expect(kickSyncWorkerMock).toHaveBeenCalledWith("run-1");
  });
});
