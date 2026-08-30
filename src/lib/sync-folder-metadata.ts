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

/**
 * Loads cached folder refs plus the timestamp of the last real folders-list
 * API call. Freshness must come from User.xFoldersFetchedAt — NOT from the
 * folder collections' updatedAt, which every sync bumps via upsert, so a
 * Collection-derived TTL would be refreshed by the very process consuming it
 * and never expire.
 */
export async function loadCachedXFolders(userId: string): Promise<{
  folders: SyncFolderRef[];
  fetchedAt: Date | null;
}> {
  const [rows, user] = await Promise.all([
    prisma.collection.findMany({
      where: {
        userId,
        type: "x_folder",
        externalSource: X_FOLDER_COLLECTION_SOURCE,
        externalSourceId: { not: null },
      },
      select: {
        externalSourceId: true,
        name: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { xFoldersFetchedAt: true },
    }),
  ]);

  const folders = rows.flatMap((row) => {
    if (!row.externalSourceId) return [];
    return [{ id: row.externalSourceId, name: row.name }];
  });

  return { folders, fetchedAt: user?.xFoldersFetchedAt ?? null };
}

/**
 * Returns X bookmark folder ids/names for the folder sync phase.
 * Skips the folders list API when DB-backed metadata is still within TTL —
 * including the "user has no folders" case, which is equally cacheable.
 */
export async function resolveXFoldersForSync(
  userId: string,
  xUserId: string,
): Promise<{ folders: SyncFolderRef[]; fromCache: boolean }> {
  const cached = await loadCachedXFolders(userId);

  if (isFolderMetadataFresh(cached.fetchedAt)) {
    return { folders: cached.folders, fromCache: true };
  }

  const { folders } = await fetchBookmarkFolders(userId, xUserId);
  await prisma.user.update({
    where: { id: userId },
    data: { xFoldersFetchedAt: new Date() },
  });
  return { folders, fromCache: false };
}
