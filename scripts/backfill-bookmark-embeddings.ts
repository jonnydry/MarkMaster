import "dotenv/config";

import { backfillBookmarkEmbeddings } from "@/lib/embedding-backfill";
import {
  listBookmarksForEmbedding,
  listExistingEmbeddingHashes,
  upsertBookmarkEmbeddings,
} from "@/lib/embedding-backfill-store";
import { createEmbeddingProvider } from "@/lib/embedding-provider";
import { prisma } from "@/lib/prisma";

import { enforceDatabaseWriteGuard } from "./db-target-guard.mjs";

function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required. See docs/SMART_SEARCH.md.");
    process.exitCode = 1;
    return;
  }

  // Refuses prod, unknown Neon endpoints, and other remote hosts unless
  // `--prod` or MARKMASTER_ALLOW_PROD=1 is passed. See docs/SMART_SEARCH.md.
  enforceDatabaseWriteGuard({
    action: "embeddings:backfill",
    urls: { DATABASE_URL: process.env.DATABASE_URL },
  });

  const counts = await backfillBookmarkEmbeddings({
    provider: createEmbeddingProvider(),
    store: {
      listBookmarks: listBookmarksForEmbedding,
      listExisting: listExistingEmbeddingHashes,
      upsert: upsertBookmarkEmbeddings,
    },
  });

  console.log(`embedded: ${counts.embedded}`);
  console.log(`skipped: ${counts.skipped}`);
  console.log(`model: ${counts.model}`);
  console.log(`dims: ${counts.dims}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Backfill failed";
    console.error(redact(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
