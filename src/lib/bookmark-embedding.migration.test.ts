import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bookmark embedding migration", () => {
  const sql = readFileSync(
    "prisma/migrations/20261018000000_add_bookmark_embedding/migration.sql",
    "utf8"
  );

  it("creates the vector extension and the embedding table without an ANN index", () => {
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector;");
    expect(sql).toContain('"embedding" vector(768) NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("bookmarkId","model","dims")');
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

describe("bookmark embedding provenance columns", () => {
  it("records model and dims on every row, as part of the key", () => {
    const sql = readFileSync(
      "prisma/migrations/20261018000000_add_bookmark_embedding/migration.sql",
      "utf8"
    );
    expect(sql).toContain('"model" TEXT NOT NULL');
    expect(sql).toContain('"dims" INTEGER NOT NULL');
    const store = readFileSync("src/lib/embedding-backfill-store.ts", "utf8");
    expect(store).toMatch(/WHERE "model" = \$\{model\}\s+AND "dims" = \$\{dims\}/);
  });
});
