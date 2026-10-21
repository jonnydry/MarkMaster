import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const executeRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
    bookmark: { findMany: vi.fn(async () => []) },
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
});
