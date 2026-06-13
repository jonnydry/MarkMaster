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
  });

  it("uses cached folder metadata when still fresh", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-1",
        name: "Cached folder",
        updatedAt: new Date(),
      },
    ] as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result).toEqual({
      folders: [{ id: "folder-1", name: "Cached folder" }],
      fromCache: true,
    });
    expect(fetchBookmarkFoldersMock).not.toHaveBeenCalled();
  });

  it("refetches folder metadata when cache is stale", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-1",
        name: "Cached folder",
        updatedAt: new Date(Date.now() - FOLDER_METADATA_TTL_MS - 1),
      },
    ] as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result).toEqual({
      folders: [{ id: "remote-1", name: "Remote folder" }],
      fromCache: false,
    });
    expect(fetchBookmarkFoldersMock).toHaveBeenCalledWith("user-1", "x-user-1");
  });

  it("refetches when no cached folders exist", async () => {
    vi.mocked(prisma.collection.findMany).mockResolvedValue([] as never);

    const result = await resolveXFoldersForSync("user-1", "x-user-1");

    expect(result.fromCache).toBe(false);
    expect(fetchBookmarkFoldersMock).toHaveBeenCalledOnce();
  });
});

describe("loadCachedXFolders", () => {
  it("returns the newest collection updatedAt as fetchedAt", async () => {
    const older = new Date("2026-06-10T12:00:00.000Z");
    const newer = new Date("2026-06-11T12:00:00.000Z");

    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        externalSourceId: "folder-a",
        name: "A",
        updatedAt: older,
      },
      {
        externalSourceId: "folder-b",
        name: "B",
        updatedAt: newer,
      },
    ] as never);

    const result = await loadCachedXFolders("user-1");

    expect(result.folders).toEqual([
      { id: "folder-a", name: "A" },
      { id: "folder-b", name: "B" },
    ]);
    expect(result.fetchedAt).toEqual(newer);
  });
});
