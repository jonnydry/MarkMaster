import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bookmark image embedding migration", () => {
  const sql = readFileSync(
    "prisma/migrations/20261021000000_add_bookmark_image_embedding/migration.sql",
    "utf8"
  );

  it("creates the image table keyed by bookmark, media item, model, and dims", () => {
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector;");
    expect(sql).toContain('"embedding" vector(768) NOT NULL');
    expect(sql).toContain('"model" TEXT NOT NULL');
    expect(sql).toContain('"dims" INTEGER NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("bookmarkId","mediaKey","model","dims")');
    expect(sql).toContain('CREATE TABLE "BookmarkImageEmbedFailure"');
    expect(sql).toContain('"failCount" INTEGER NOT NULL');
    expect(sql).toContain('"lastError" TEXT NOT NULL');
    expect(sql).toContain('"lastFailedAt" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain("ON DELETE CASCADE ON UPDATE CASCADE");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();
    expect(statements).not.toContain("hnsw");
    expect(statements).not.toContain("ivfflat");
  });
});

describe("image embedding store provenance", () => {
  it("reads and writes model and dims with the media key", () => {
    const store = readFileSync("src/lib/image-embedding-backfill-store.ts", "utf8");
    expect(store).toMatch(/WHERE "model" = \$\{model\}\s+AND "dims" = \$\{dims\}/);
    expect(store).toContain('"mediaKey"');
    expect(store).toContain('ON CONFLICT ("bookmarkId", "mediaKey", "model", "dims")');
    expect(store).toContain('FROM "BookmarkImageEmbedFailure"');
    expect(store).toContain('"failCount" = "BookmarkImageEmbedFailure"."failCount" + 1');
  });
});

describe("image score printer", () => {
  it("only reads cosine distances", () => {
    const source = readFileSync("scripts/print-image-search-scores.ts", "utf8");
    expect(source).toContain("embeddings:image-scores");
    expect(source).toContain('FROM "BookmarkImageEmbedding"');
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  });
});
