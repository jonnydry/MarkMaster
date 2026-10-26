import { beforeEach, describe, expect, it, vi } from "vitest";

const executeSyncRunMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sync-run-executor", () => ({
  executeSyncRun: executeSyncRunMock,
}));

const tx = {
  $executeRaw: vi.fn(),
  syncRun: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(tx)),
    syncRun: {
      findMany: vi.fn(),
    },
  },
}));

describe("processSyncRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    executeSyncRunMock.mockResolvedValue(undefined);
  });

  it("claims a pending run and executes it", async () => {
    tx.syncRun.findUnique
      .mockResolvedValueOnce({
        id: "run-1",
        userId: "user-1",
        status: "PENDING",
        continuationToken: "token-abc",
        includeFolders: false,
      })
      .mockResolvedValueOnce({
        id: "run-1",
        userId: "user-1",
        continuationToken: "token-abc",
        includeFolders: false,
      });
    tx.syncRun.findFirst.mockResolvedValue(null);
    tx.syncRun.updateMany.mockResolvedValue({ count: 1 });

    const { processSyncRun } = await import("./sync-queue");
    const result = await processSyncRun("run-1");

    expect(result).toEqual({ processed: true, runId: "run-1" });
    expect(tx.syncRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", status: "PENDING" },
      data: { status: "RUNNING" },
    });
    expect(executeSyncRunMock).toHaveBeenCalledWith(
      "run-1",
      "user-1",
      "token-abc",
      false
    );
  });

  it("executes the run owner's user id", async () => {
    tx.syncRun.findUnique
      .mockResolvedValueOnce({
        id: "run-b",
        userId: "user-b",
        status: "PENDING",
        continuationToken: null,
        includeFolders: true,
      })
      .mockResolvedValueOnce({
        id: "run-b",
        userId: "user-b",
        continuationToken: null,
        includeFolders: true,
      });
    tx.syncRun.findFirst.mockResolvedValue(null);
    tx.syncRun.updateMany.mockResolvedValue({ count: 1 });

    const { processSyncRun } = await import("./sync-queue");
    const result = await processSyncRun("run-b");

    expect(result).toEqual({ processed: true, runId: "run-b" });
    expect(executeSyncRunMock).toHaveBeenCalledTimes(1);
    expect(executeSyncRunMock).toHaveBeenCalledWith(
      "run-b",
      "user-b",
      undefined,
      true
    );
    expect(executeSyncRunMock.mock.calls[0]?.[1]).not.toBe("user-1");
  });

  it("does not process when the claim loses a concurrent race", async () => {
    tx.syncRun.findUnique.mockResolvedValue({
      id: "run-1",
      userId: "user-1",
      status: "PENDING",
      continuationToken: null,
      includeFolders: false,
    });
    tx.syncRun.findFirst.mockResolvedValue(null);
    tx.syncRun.updateMany.mockResolvedValue({ count: 0 });

    const { processSyncRun } = await import("./sync-queue");
    const result = await processSyncRun("run-1");

    expect(result).toEqual({ processed: false });
    expect(executeSyncRunMock).not.toHaveBeenCalled();
  });

  it("skips runs that are not pending", async () => {
    tx.syncRun.findUnique.mockResolvedValue({
      id: "run-1",
      userId: "user-1",
      status: "RUNNING",
      continuationToken: null,
    });

    const { processSyncRun } = await import("./sync-queue");
    const result = await processSyncRun("run-1");

    expect(result).toEqual({ processed: false });
    expect(executeSyncRunMock).not.toHaveBeenCalled();
  });
});
