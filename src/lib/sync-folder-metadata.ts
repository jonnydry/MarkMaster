import { prisma } from "./prisma";
import { fetchBookmarkFolders } from "./x-api";

export const X_FOLDER_COLLECTION_SOURCE = "x-bookmark-folder";

/** Re-use cached folder ids/names for this long before calling X again. */
export const FOLDER_METADATA_TTL_MS = 24 * 60 * 60 * 1000;

export type SyncFolderRef = {
  id: string;
  name: string;
};

export function isFolderMetadataFresh(
  fetchedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!fetchedAt) return false;
  return now.getTime() - fetchedAt.getTime() < FOLDER_METADATA_TTL_MS;
}

export async function loadCachedXFolders(userId: string): Promise<{
  folders: SyncFolderRef[];
  fetchedAt: Date | null;
}> {
  const rows = await prisma.collection.findMany({
    where: {
      userId,
      type: "x_folder",
      externalSource: X_FOLDER_COLLECTION_SOURCE,
      externalSourceId: { not: null },
    },
    select: {
      externalSourceId: true,
      name: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  if (rows.length === 0) {
    return { folders: [], fetchedAt: null };
  }

  const fetchedAt = rows.reduce<Date>(
    (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
    rows[0].updatedAt,
  );

  const folders = rows.flatMap((row) => {
    if (!row.externalSourceId) return [];
    return [{ id: row.externalSourceId, name: row.name }];
  });

  return { folders, fetchedAt };
}

/**
 * Returns X bookmark folder ids/names for the folder sync phase.
 * Skips the folders list API when DB-backed metadata is still within TTL.
 */
export async function resolveXFoldersForSync(
  userId: string,
  xUserId: string,
): Promise<{ folders: SyncFolderRef[]; fromCache: boolean }> {
  const cached = await loadCachedXFolders(userId);

  if (
    cached.folders.length > 0 &&
    isFolderMetadataFresh(cached.fetchedAt)
  ) {
    return { folders: cached.folders, fromCache: true };
  }

  const { folders } = await fetchBookmarkFolders(userId, xUserId);
  return { folders, fromCache: false };
}
