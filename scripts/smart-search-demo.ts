import "dotenv/config";
import { readFileSync } from "node:fs";

import { EMBEDDING_BACKFILL_BATCH_SIZE, EMBEDDING_BACKFILL_TIMEOUT_MS } from "@/lib/embedding-backfill";
import { createEmbeddingProvider, EmbeddingProviderError } from "@/lib/embedding-provider";
import {
  demoDocumentText,
  formatDemoReport,
  keywordHitIds,
  parseBookmarkExport,
  smartHitIds,
} from "@/lib/smart-search-demo";

function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

async function main() {
  const [file, ...queries] = process.argv.slice(2);
  if (!file || queries.length === 0) {
    console.error(
      "Usage: npm run embeddings:demo -- <bookmarks.json> <query> [query...]"
    );
    process.exitCode = 1;
    return;
  }

  let bookmarks;
  try {
    bookmarks = parseBookmarkExport(JSON.parse(readFileSync(file, "utf8")) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the bookmark export";
    console.error(redact(message));
    process.exitCode = 1;
    return;
  }

  const provider = createEmbeddingProvider();
  const vectors = new Map<string, number[]>();
  const texts = bookmarks.map((bookmark) => demoDocumentText(bookmark));

  for (let offset = 0; offset < bookmarks.length; offset += EMBEDDING_BACKFILL_BATCH_SIZE) {
    const batch = bookmarks.slice(offset, offset + EMBEDDING_BACKFILL_BATCH_SIZE);
    const embedded = await provider.embed(texts.slice(offset, offset + batch.length), "document", {
      timeoutMs: EMBEDDING_BACKFILL_TIMEOUT_MS,
    });
    batch.forEach((bookmark, index) => {
      const vector = embedded[index];
      if (vector) vectors.set(bookmark.id, vector);
    });
    console.error(`embedded ${Math.min(offset + batch.length, bookmarks.length)}/${bookmarks.length}`);
  }

  for (const query of queries) {
    const [queryVector] = await provider.embed([query], "query", {
      timeoutMs: EMBEDDING_BACKFILL_TIMEOUT_MS,
    });
    if (!queryVector) {
      throw new EmbeddingProviderError("provider_unavailable");
    }
    console.log(
      formatDemoReport({
        query,
        bookmarks,
        keywordIds: keywordHitIds(bookmarks, query),
        smartIds: smartHitIds(bookmarks, queryVector, vectors, query),
      })
    );
    console.log("");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Smart search demo failed";
  console.error(redact(message));
  process.exitCode = 1;
});
