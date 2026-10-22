import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const executeRaw = vi.fn();
const findMany = vi.fn(async () => []);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
    bookmark: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

function sqlText(query: unknown): string {
  if (!query || typeof query !== "object" || !("strings" in query)) return "";
  return (query as { strings: readonly string[] }).strings.join(" ");
}

describe("image embed failure store", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    executeRaw.mockReset();
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("records a short status and reads failures for one model", async () => {
    const { listImageEmbedFailures, recordImageEmbedFailure } = await import(
      "./image-embedding-backfill-store"
    );
    const failedAt = new Date("2026-01-02T00:00:00.000Z");
    queryRaw.mockResolvedValueOnce([
      {
        bookmarkId: "b",
        mediaKey: "https://pbs.twimg.com/a.jpg",
        failCount: 2,
        lastFailedAt: failedAt,
      },
    ]);

    const rows = await listImageEmbedFailures("vision", 768);
    expect(rows).toEqual([
      {
        bookmarkId: "b",
        mediaKey: "https://pbs.twimg.com/a.jpg",
        failCount: 2,
        lastFailedAt: failedAt,
      },
    ]);
    expect(sqlText(queryRaw.mock.calls[0]?.[0])).toContain('FROM "BookmarkImageEmbedFailure"');

    await recordImageEmbedFailure({
      bookmarkId: "b",
      mediaKey: "https://pbs.twimg.com/a.jpg",
      model: "vision",
      dims: 768,
      status: "404 <html>",
      failedAt,
    });
    const write = sqlText(executeRaw.mock.calls[0]?.[0]);
    expect(write).toContain('INSERT INTO "BookmarkImageEmbedFailure"');
    expect(write).toContain('"failCount" = "BookmarkImageEmbedFailure"."failCount" + 1');
    const values = (executeRaw.mock.calls[0]?.[0] as { values: unknown[] }).values;
    expect(values).toContain("404html");
    expect(values).not.toContain("404 <html>");
  });

  it("drops failure rows whose media item is gone", async () => {
    const { clearImageEmbedFailure, deleteAbsentImageEmbedFailures } = await import(
      "./image-embedding-backfill-store"
    );
    executeRaw.mockResolvedValue(1);
    await deleteAbsentImageEmbedFailures("vision", 768, []);
    expect(sqlText(executeRaw.mock.calls[0]?.[0])).toContain('DELETE FROM "BookmarkImageEmbedFailure"');

    await deleteAbsentImageEmbedFailures("vision", 768, [
      { bookmarkId: "b", mediaKey: "https://pbs.twimg.com/a.jpg" },
    ]);
    expect(sqlText(executeRaw.mock.calls[1]?.[0])).toContain("unnest");

    await clearImageEmbedFailure("b", "https://pbs.twimg.com/a.jpg", "vision", 768);
    expect(sqlText(executeRaw.mock.calls[2]?.[0])).toContain('"bookmarkId"');
  });

  it("limits bookmark reads and deletes to one user", async () => {
    const {
      deleteAbsentImageEmbeddings,
      deleteAbsentImageEmbedFailures,
      listBookmarksForImageEmbedding,
      listExistingImageEmbeddings,
      listImageEmbedFailures,
    } = await import("./image-embedding-backfill-store");

    await listBookmarksForImageEmbedding();
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty("where");
    await listBookmarksForImageEmbedding("user-1");
    expect(findMany.mock.calls[1]?.[0].where).toEqual({ userId: "user-1" });

    queryRaw.mockResolvedValue([]);
    await listExistingImageEmbeddings("vision", 768);
    expect(sqlText(queryRaw.mock.calls[0]?.[0])).not.toContain('"userId"');
    await listExistingImageEmbeddings("vision", 768, "user-1");
    const scopedList = queryRaw.mock.calls[1]?.[0] as { values: unknown[] };
    expect(sqlText(scopedList)).toContain('"userId"');
    expect(scopedList.values).toContain("user-1");

    await listImageEmbedFailures("vision", 768, "user-1");
    const scopedFailures = queryRaw.mock.calls[2]?.[0] as { values: unknown[] };
    expect(sqlText(scopedFailures)).toContain('"BookmarkImageEmbedFailure"');
    expect(scopedFailures.values).toContain("user-1");

    executeRaw.mockResolvedValue(0);
    await deleteAbsentImageEmbeddings("vision", 768, []);
    expect(sqlText(executeRaw.mock.calls[0]?.[0])).not.toContain('"userId"');

    await deleteAbsentImageEmbeddings("vision", 768, [], "user-1");
    const scopedDelete = executeRaw.mock.calls[1]?.[0] as { values: unknown[] };
    const deleteSql = sqlText(scopedDelete);
    expect(deleteSql).toContain('"BookmarkImageEmbedding"');
    expect(deleteSql).toContain('"userId"');
    expect(scopedDelete.values).toContain("user-1");
    expect(deleteSql).not.toContain("unnest");

    await deleteAbsentImageEmbedFailures(
      "vision",
      768,
      [{ bookmarkId: "b", mediaKey: "https://pbs.twimg.com/a.jpg" }],
      "user-1"
    );
    const scopedFailureDelete = executeRaw.mock.calls[2]?.[0] as { values: unknown[] };
    const failureSql = sqlText(scopedFailureDelete);
    expect(failureSql).toContain('"BookmarkImageEmbedFailure"');
    expect(failureSql).toContain('"userId"');
    expect(failureSql).toContain("unnest");
    expect(scopedFailureDelete.values).toContain("user-1");
    expect(scopedFailureDelete.values).not.toContain("other-user");
  });
});
