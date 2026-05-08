import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  $executeRaw: vi.fn(),
  syncRun: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/sync", () => ({
  syncBookmarks: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(tx)),
    syncRun: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("/api/bookmarks/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    tx.syncRun.updateMany.mockResolvedValue({ count: 0 });
    tx.syncRun.findFirst.mockResolvedValue(null);
    tx.syncRun.create.mockResolvedValue({ id: "run-1" });
  });

  it("takes the sync advisory lock without deserializing its void result", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { syncBookmarks } = await import("@/lib/sync");
    const { POST } = await import("./route");

    vi.mocked(syncBookmarks).mockResolvedValue({
      newBookmarks: 0,
      updatedBookmarks: 0,
      totalFetched: 0,
      hitExisting: true,
      rateLimited: false,
      rateLimitResetsAt: null,
      pagesFetched: 0,
    });
    vi.mocked(prisma.syncRun.update).mockResolvedValue({
      id: "run-1",
    } as never);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.syncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });
});
