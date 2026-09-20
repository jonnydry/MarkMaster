import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orbitScanSnapshot: {
      findUnique,
      upsert,
      deleteMany,
    },
  },
}));

const snapshot = {
  version: 1 as const,
  userId: "user-1",
  savedAt: "2026-09-20T00:00:00.000Z",
  payload: {
    scanRunId: "run-1",
    model: "grok-4-fast",
    scannedAt: "2026-09-19T00:00:00.000Z",
    privacy: { storeDisabled: true, zeroDataRetention: null },
    batch: {
      mode: "auto" as const,
      profile: "balanced" as const,
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
          confidence: "high" as const,
          reasoning: "clear",
          tags: [
            { name: "testing", color: "#fff", reason: "topic", reuseExisting: true },
          ],
          collection: null,
        },
      ],
    },
    summary: { bookmarkCount: 1 },
    tagRollups: [],
    collectionRollups: [],
  },
  dismissedBookmarkIds: [] as string[],
  appliedBookmarkIds: [] as string[],
};

describe("orbit-scan-snapshot-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid stored snapshot", async () => {
    findUnique.mockResolvedValue({ snapshot });
    const { loadOrbitScanSnapshotForUser } = await import(
      "./orbit-scan-snapshot-store"
    );

    await expect(loadOrbitScanSnapshotForUser("user-1")).resolves.toMatchObject({
      userId: "user-1",
      payload: { scanRunId: "run-1" },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("drops a corrupt stored snapshot", async () => {
    findUnique.mockResolvedValue({ snapshot: { version: 99 } });
    const { loadOrbitScanSnapshotForUser } = await import(
      "./orbit-scan-snapshot-store"
    );

    await expect(loadOrbitScanSnapshotForUser("user-1")).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("upserts and deletes by user", async () => {
    const {
      saveOrbitScanSnapshotForUser,
      deleteOrbitScanSnapshotForUser,
    } = await import("./orbit-scan-snapshot-store");

    await saveOrbitScanSnapshotForUser(snapshot);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      })
    );

    await deleteOrbitScanSnapshotForUser("user-1");
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});
