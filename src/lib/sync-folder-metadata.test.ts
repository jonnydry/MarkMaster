import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchBookmarkFoldersMock = vi.hoisted(() => vi.fn());

vi.mock("./x-api", () => ({
  fetchBookmarkFolders: fetchBookmarkFoldersMock,
}));

vi.mock("./prisma", () => ({
  prisma: {
    collection: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "./prisma";
import {
  FOLDER_METADATA_TTL_MS,
  isFolderMetadataFresh,
  loadCachedXFolders,
  resolveXFoldersForSync,
} from "./sync-folder-metadata";

describe("isFolderMetadataFresh", () => {
  it("returns false when no timestamp exists", () => {
    expect(isFolderMetadataFresh(null)).toBe(false);
  });

  it("returns true inside the TTL window", () => {
    const now = new Date("2026-06-11T12:00:00.000Z");
    const fetchedAt = new Date(now.getTime() - FOLDER_METADATA_TTL_MS + 60_000);

    expect(isFolderMetadataFresh(fetchedAt, now)).toBe(true);
  });

  it("returns false after the TTL window", () => {
    const now = new Date("2026-06-11T12:00:00.000Z");
    const fetchedAt = new Date(now.getTime() - FOLDER_METADATA_TTL_MS - 1);

    expect(isFolderMetadataFresh(fetchedAt, now)).toBe(false);
  });
});

describe("resolveXFoldersForSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBookmarkFoldersMock.mockResolvedValue({
      folders: [{ id: "remote-1", name: "Remote folder" }],
    });
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  });

  it("uses cached folder metadata when still fresh", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-1",
        name: "Cached folder",
      },
    ] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      xFoldersFetchedAt: new Date(),
    } as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result).toEqual({
      folders: [{ id: "folder-1", name: "Cached folder" }],
      fromCache: true,
    });
    expect(fetchBookmarkFoldersMock).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("caches the zero-folder case when the fetch timestamp is fresh", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      xFoldersFetchedAt: new Date(),
    } as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result).toEqual({ folders: [], fromCache: true });
    expect(fetchBookmarkFoldersMock).not.toHaveBeenCalled();
  });

  it("refetches folder metadata when the fetch timestamp is stale", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-1",
        name: "Cached folder",
      },
    ] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      xFoldersFetchedAt: new Date(Date.now() - FOLDER_METADATA_TTL_MS - 1),
    } as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result).toEqual({
      folders: [{ id: "remote-1", name: "Remote folder" }],
      fromCache: false,
    });
    expect(fetchBookmarkFoldersMock).toHaveBeenCalledWith("user-1", "x-user-1");
    // A real fetch stamps the dedicated timestamp so the TTL is driven by
    // actual API calls, not by sync's own collection upserts.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { xFoldersFetchedAt: expect.any(Date) },
    });
  });

  it("refetches when the timestamp has never been set", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-1",
        name: "Cached folder",
      },
    ] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      xFoldersFetchedAt: null,
    } as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result.fromCache).toBe(false);
    expect(fetchBookmarkFoldersMock).toHaveBeenCalledOnce();
  });
});

describe("loadCachedXFolders", () => {
  it("returns the user's xFoldersFetchedAt as fetchedAt", async () => {
    const fetchedAt = new Date("2026-06-11T12:00:00.000Z");

    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-a",
        name: "A",
      },
      {
        externalSourceId: "folder-b",
        name: "B",
      },
    ] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      xFoldersFetchedAt: fetchedAt,
    } as never);

    const result = await loadCachedXFolders("user-1");

    expect(result.folders).toEqual([
      { id: "folder-a", name: "A" },
      { id: "folder-b", name: "B" },
    ]);
    expect(result.fetchedAt).toEqual(fetchedAt);
  });
});
