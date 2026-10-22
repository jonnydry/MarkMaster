import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncBookmarks: vi.fn(),
  embedBookmarksAfterSync: vi.fn(),
  invalidate: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  syncBookmarks: mocks.syncBookmarks,
}));

vi.mock("@/lib/sync-embed", () => ({
  embedBookmarksAfterSync: mocks.embedBookmarksAfterSync,
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCacheImmediate: mocks.invalidate,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    syncRun: { updateMany: mocks.updateMany },
  },
}));

import { executeSyncRun } from "./sync-run-executor";

const progress = {
  newBookmarks: 1,
  updatedBookmarks: 0,
  totalFetched: 1,
  hitExisting: false,
  pagesFetched: 1,
};

function successResult(overrides: Record<string, unknown> = {}) {
  return {
    ...progress,
    rateLimited: false,
    ...overrides,
  };
}

describe("executeSyncRun embedding", () => {
  const order: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    mocks.invalidate.mockImplementation(async () => {
      order.push("invalidate");
    });
    mocks.embedBookmarksAfterSync.mockImplementation(async () => {
      order.push("embed");
    });
    mocks.updateMany.mockImplementation(async (args: { data: { status?: string } }) => {
      order.push(args.data.status ? `status:${args.data.status}` : "write");
      return { count: 1 };
    });
    mocks.syncBookmarks.mockImplementation(async (_userId: string, _token: string | undefined, onProgress?: (snapshot: typeof progress) => Promise<void>) => {
      await onProgress?.(progress);
      return successResult();
    });
  });

  it("embeds that user after a successful sync", async () => {
    await executeSyncRun("run-1", "user-1");

    expect(mocks.embedBookmarksAfterSync).toHaveBeenCalledTimes(1);
    expect(mocks.embedBookmarksAfterSync).toHaveBeenCalledWith("user-1");
    expect(order).toEqual(["write", "status:COMPLETED", "invalidate", "embed", "invalidate"]);
  });

  it("embeds after a rate-limited sync that still saved bookmarks", async () => {
    mocks.syncBookmarks.mockImplementation(async () => successResult({ rateLimited: true }));

    await executeSyncRun("run-1", "user-1");

    expect(order).toContain("status:RATE_LIMITED");
    expect(mocks.embedBookmarksAfterSync).toHaveBeenCalledWith("user-1");
  });

  it("keeps the sync successful when embedding throws", async () => {
    mocks.embedBookmarksAfterSync.mockRejectedValue(new Error("ollama down postgres://secret bookmark bk_1"));

    await expect(executeSyncRun("run-1", "user-7")).resolves.toBeUndefined();
    expect(order).toEqual(["write", "status:COMPLETED", "invalidate", "invalidate"]);
    const completion = mocks.updateMany.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === "COMPLETED"
    );
    expect(completion).toBeTruthy();
  });

  it("does not embed when the sync fails or the run was superseded", async () => {
    mocks.syncBookmarks.mockRejectedValue(new Error("x api down"));
    await executeSyncRun("run-1", "user-1");
    expect(mocks.embedBookmarksAfterSync).not.toHaveBeenCalled();
    expect(order).toContain("status:FAILED");

    vi.clearAllMocks();
    order.length = 0;
    mocks.updateMany.mockImplementation(async (args: { data: { status?: string } }) => {
      order.push(args.data.status ? `status:${args.data.status}` : "write");
      return { count: args.data.status ? 0 : 1 };
    });
    mocks.syncBookmarks.mockImplementation(async () => successResult());
    await executeSyncRun("run-2", "user-1");
    expect(mocks.embedBookmarksAfterSync).not.toHaveBeenCalled();
    expect(order).toEqual(["status:COMPLETED", "invalidate"]);
  });
});
