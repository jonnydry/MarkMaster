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
    update: vi.fn(),
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
    tx.syncRun.findUnique.mockResolvedValue({
      id: "run-1",
      userId: "user-1",
      status: "PENDING",
      continuationToken: "token-abc",
      includeFolders: false,
    });
    tx.syncRun.findFirst.mockResolvedValue(null);
    tx.syncRun.update.mockResolvedValue({
      id: "run-1",
      userId: "user-1",
      continuationToken: "token-abc",
      includeFolders: false,
    });

    const { processSyncRun } = await import("./sync-queue");
    const result = await processSyncRun("run-1");

    expect(result).toEqual({ processed: true, runId: "run-1" });
    expect(tx.syncRun.update).toHaveBeenCalledWith({
      where: { id: "run-1", status: "PENDING" },
      data: { status: "RUNNING" },
      select: {
        id: true,
        userId: true,
        continuationToken: true,
        includeFolders: true,
      },
    });
    expect(executeSyncRunMock).toHaveBeenCalledWith(
      "run-1",
      "user-1",
      "token-abc",
      false
    );
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
