import type { CollectionWithCount } from "@/types";

export type CollectionFilter = "all" | "mine" | "public" | "x_folders";

export type CollectionStats = {
  totalBookmarks: number;
  emptyCount: number;
  publicCount: number;
  maxItems: number;
  largestCollection: CollectionWithCount | null;
};

export function getCollectionItemCount(collection: CollectionWithCount) {
  return collection._count?.items ?? 0;
}

export function bookmarkLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "bookmark" : "bookmarks"}`;
}

export function collectionLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "collection" : "collections"}`;
}

export function splitCollections(collections: CollectionWithCount[]) {
  const grouped = {
    userCollections: [] as CollectionWithCount[],
    xFolders: [] as CollectionWithCount[],
  };

  for (const collection of collections) {
    if (collection.type === "x_folder") {
      grouped.xFolders.push(collection);
    } else {
      grouped.userCollections.push(collection);
    }
  }

  return grouped;
}

export function collectionMatchesSearch(
  collection: CollectionWithCount,
  normalizedSearch: string
) {
  if (!normalizedSearch) return true;

  const status =
    collection.type === "x_folder"
      ? "x folder synced folder"
      : collection.isPublic
        ? "public personal collection"
        : "private personal collection";

  return [collection.name, collection.description, status]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedSearch);
}

export function matchesCollectionFilter(
  collection: CollectionWithCount,
  activeFilter: CollectionFilter
) {
  if (activeFilter === "all") return true;
  if (activeFilter === "mine") return collection.type === "user_collection";
  if (activeFilter === "public") {
    return collection.type === "user_collection" && collection.isPublic;
  }
  return collection.type === "x_folder";
}

export function filterCollections(
  collections: CollectionWithCount[],
  activeFilter: CollectionFilter,
  normalizedSearch: string
) {
  return collections.filter(
    (collection) =>
      matchesCollectionFilter(collection, activeFilter) &&
      collectionMatchesSearch(collection, normalizedSearch)
  );
}

export function computeCollectionStats(
  collections: CollectionWithCount[],
  userCollections: CollectionWithCount[]
): CollectionStats {
  let totalBookmarks = 0;
  let emptyCount = 0;
  let largestCollection: CollectionWithCount | null = null;

  for (const collection of collections) {
    const count = getCollectionItemCount(collection);
    totalBookmarks += count;
    if (count === 0) emptyCount += 1;
    if (
      !largestCollection ||
      count > getCollectionItemCount(largestCollection)
    ) {
      largestCollection = collection;
    }
  }

  return {
    totalBookmarks,
    emptyCount,
    publicCount: userCollections.filter((collection) => collection.isPublic)
      .length,
    maxItems: largestCollection ? getCollectionItemCount(largestCollection) : 0,
    largestCollection,
  };
}

export function buildCollectionsSummary(
  isLoading: boolean,
  isError: boolean,
  userCollections: CollectionWithCount[],
  xFolders: CollectionWithCount[],
  totalCollections: number
): string | undefined {
  if (isLoading || isError || totalCollections === 0) return undefined;

  return `${userCollections.length} personal ${
    userCollections.length === 1 ? "collection" : "collections"
  }${
    xFolders.length > 0
      ? ` · ${xFolders.length} X ${xFolders.length === 1 ? "folder" : "folders"}`
      : ""
  }`;
}
