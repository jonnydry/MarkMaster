// The guard module must load first: it captures MARKMASTER_ALLOW_PROD from the
// launch environment before dotenv/config reads .env.
import { enforceDatabaseWriteGuard } from "./db-target-guard.mjs";

import "dotenv/config";

import { Prisma } from "@prisma/client";

import {
  IMAGE_SCORE_EMBED_TIMEOUT_MS,
  createEmbeddingProvider,
  createImageTextEmbeddingProvider,
  embedSearchQuery,
  smartSearchEmbedTimeoutMs,
  type EmbeddingProvider,
} from "@/lib/embedding-provider";
import { toPgVectorLiteral } from "@/lib/pg-vector";
import { prisma } from "@/lib/prisma";
import {
  DUAL_MATCH_SCORE_BONUS,
  IMAGE_HIT_SCORE_OFFSET,
  imageHitSimilarityCutoff,
} from "@/lib/smart-search-merge";

const TOP_SCORES = 10;

function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

type ScoreRow = { id: string; mediaKey?: string; distance: unknown };

function similarityFromDistance(distance: unknown): number | null {
  const value =
    typeof distance === "number"
      ? distance
      : typeof distance === "string"
        ? Number(distance)
        : Number.NaN;
  return Number.isFinite(value) ? 1 - value : null;
}

function printScores(label: string, rows: ScoreRow[]): void {
  if (rows.length === 0) {
    console.log(`${label}: none`);
    return;
  }
  rows.forEach((row, index) => {
    const similarity = similarityFromDistance(row.distance);
    const shown = similarity === null ? "n/a" : similarity.toFixed(4);
    const media = row.mediaKey ? ` media=${row.mediaKey}` : "";
    console.log(`${label} ${index + 1} similarity=${shown} bookmark=${row.id}${media}`);
  });
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required. See docs/SMART_SEARCH.md.");
    process.exitCode = 1;
    return;
  }

  // Read-only, but a prod URL is still refused unless `--prod` is passed in
  // the launch shell. This command only runs SELECT.
  enforceDatabaseWriteGuard({
    action: "embeddings:image-scores",
    urls: { DATABASE_URL: process.env.DATABASE_URL },
  });

  const queries = process.argv.slice(2).filter((arg) => arg !== "--prod" && arg.trim() !== "");
  if (queries.length === 0) {
    console.error('Pass one or more queries: npm run embeddings:image-scores -- "your query"');
    process.exitCode = 1;
    return;
  }

  const textProvider = createEmbeddingProvider();
  const imageProvider = createImageTextEmbeddingProvider();
  const cutoff = imageHitSimilarityCutoff();
  const timeoutMs = smartSearchEmbedTimeoutMs(process.env, IMAGE_SCORE_EMBED_TIMEOUT_MS);
  console.log(`text model: ${textProvider.model}`);
  console.log(`image model: ${imageProvider.model}`);
  console.log(`cutoff: ${cutoff}`);
  console.log(`embed timeout ms: ${timeoutMs}`);
  console.log(`image score = similarity - ${IMAGE_HIT_SCORE_OFFSET}`);
  console.log(
    `merged score = max(text cosine, image score) + ${DUAL_MATCH_SCORE_BONUS} when both match`
  );
  console.log("read-only: top raw cosine similarities");

  // Embed every text query before any image query so Ollama loads each model once.
  const textEmbeddings = await embedQueries(textProvider, queries, timeoutMs);
  const imageEmbeddings = await embedQueries(imageProvider, queries, timeoutMs);

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index] ?? "";
    const safeQuery = query.replace(/[\u0000-\u001f\u007f]/g, "");
    console.log(`query: ${safeQuery}`);
    await printTextScores(textProvider, textEmbeddings[index]);
    await printImageScores(imageProvider, imageEmbeddings[index]);
  }
}

type EmbeddedQuery = { vector: number[] | null; error: string | null };

async function embedQueries(
  provider: EmbeddingProvider,
  queries: readonly string[],
  timeoutMs: number
): Promise<EmbeddedQuery[]> {
  const embedded: EmbeddedQuery[] = [];
  for (const query of queries) {
    try {
      embedded.push({
        vector: await embedSearchQuery(provider, query, timeoutMs),
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "embed failed";
      embedded.push({ vector: null, error: message });
    }
  }
  return embedded;
}

async function printTextScores(
  provider: EmbeddingProvider,
  embedded: EmbeddedQuery | undefined
): Promise<void> {
  if (!embedded?.vector) {
    console.log(`text: skipped (${redact(embedded?.error ?? "text embed failed")})`);
    return;
  }
  try {
    const literal = toPgVectorLiteral(embedded.vector, provider.dims);
    const rows = await prisma.$queryRaw<ScoreRow[]>(Prisma.sql`
      SELECT b."id" AS "id", (e."embedding" <=> ${literal}::vector) AS "distance"
      FROM "BookmarkEmbedding" e
      INNER JOIN "Bookmark" b ON b."id" = e."bookmarkId"
      WHERE e."model" = ${provider.model}
        AND e."dims" = ${provider.dims}
      ORDER BY "distance" ASC, b."id" ASC
      LIMIT ${TOP_SCORES}
    `);
    printScores("text", rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "text embed failed";
    console.log(`text: skipped (${redact(message)})`);
  }
}

async function printImageScores(
  provider: EmbeddingProvider,
  embedded: EmbeddedQuery | undefined
): Promise<void> {
  if (!embedded?.vector) {
    console.log(`image: skipped (${redact(embedded?.error ?? "image embed failed")})`);
    return;
  }
  try {
    const literal = toPgVectorLiteral(embedded.vector, provider.dims);
    const rows = await prisma.$queryRaw<Array<ScoreRow & { mediaKey: string }>>(Prisma.sql`
      SELECT b."id" AS "id", e."mediaKey" AS "mediaKey", (e."embedding" <=> ${literal}::vector) AS "distance"
      FROM "BookmarkImageEmbedding" e
      INNER JOIN "Bookmark" b ON b."id" = e."bookmarkId"
      WHERE e."model" = ${provider.model}
        AND e."dims" = ${provider.dims}
      ORDER BY "distance" ASC, b."id" ASC, e."mediaKey" ASC
      LIMIT ${TOP_SCORES}
    `);
    printScores("image", rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "image embed failed";
    console.log(`image: skipped (${redact(message)})`);
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Image score print failed";
    console.error(redact(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
