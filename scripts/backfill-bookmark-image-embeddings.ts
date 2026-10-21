// The guard module must load first: it captures MARKMASTER_ALLOW_PROD from the
// launch environment before dotenv/config reads .env.
import { enforceDatabaseWriteGuard } from "./db-target-guard.mjs";

import "dotenv/config";

import { createOllamaImageEmbedder } from "@/lib/embedding-provider";
import { backfillBookmarkImageEmbeddings } from "@/lib/image-embedding-backfill";
import {
  deleteAbsentImageEmbeddings,
  listBookmarksForImageEmbedding,
  listExistingImageEmbeddings,
  upsertBookmarkImageEmbeddings,
} from "@/lib/image-embedding-backfill-store";
import { prisma } from "@/lib/prisma";

function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

function logSkip(url: string, status: string): void {
  const safeUrl = url.replace(/[\u0000-\u001f\u007f]/g, "");
  const safeStatus = status.replace(/[^\w.-]/g, "");
  console.warn(`image-embedding skip ${safeUrl} ${safeStatus}`);
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
    action: "embeddings:backfill-images",
    urls: { DATABASE_URL: process.env.DATABASE_URL },
  });

  const counts = await backfillBookmarkImageEmbeddings({
    embedder: createOllamaImageEmbedder(),
    store: {
      listBookmarks: listBookmarksForImageEmbedding,
      listExisting: listExistingImageEmbeddings,
      deleteAbsent: deleteAbsentImageEmbeddings,
      upsert: upsertBookmarkImageEmbeddings,
    },
    onSkip: ({ url, status }) => logSkip(url, status),
  });

  console.log(`embedded: ${counts.embedded}`);
  console.log(`skipped: ${counts.skipped}`);
  console.log(`failed: ${counts.failed}`);
  console.log(`removed: ${counts.removed}`);
  console.log(`model: ${counts.model}`);
  console.log(`dims: ${counts.dims}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Image backfill failed";
    console.error(redact(message));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
