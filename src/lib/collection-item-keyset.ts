import type { Prisma as PrismaTypes } from "@prisma/client";

export interface CollectionItemListCursor {
  sortOrder: number;
  id: string;
}

type CollectionItemCursorSource = {
  id: string;
  sortOrder: number;
};

const CURSOR_VERSION = 1;
const MAX_CURSOR_BYTES = 512;

type EncodedCollectionItemListCursor = CollectionItemListCursor & { v: number };

export function buildCollectionItemListCursor(
  item: CollectionItemCursorSource
): CollectionItemListCursor {
  return {
    sortOrder: item.sortOrder,
    id: item.id,
  };
}

export function encodeCollectionItemListCursor(
  cursor: CollectionItemListCursor
): string {
  const payload: EncodedCollectionItemListCursor = { ...cursor, v: CURSOR_VERSION };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCollectionItemListCursor(
  raw: string
): CollectionItemListCursor | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") > MAX_CURSOR_BYTES) {
      return null;
    }

    const parsed = JSON.parse(decoded) as Partial<EncodedCollectionItemListCursor>;
    if (parsed.v !== CURSOR_VERSION) return null;
    if (!parsed.id || typeof parsed.id !== "string") return null;
    if (typeof parsed.sortOrder !== "number" || !Number.isFinite(parsed.sortOrder)) {
      return null;
    }

    return {
      sortOrder: parsed.sortOrder,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function buildPrismaCollectionItemKeysetFilter(
  cursor: CollectionItemListCursor
): PrismaTypes.CollectionItemWhereInput {
  return {
    OR: [
      { sortOrder: { gt: cursor.sortOrder } },
      { sortOrder: cursor.sortOrder, id: { gt: cursor.id } },
    ],
  };
}

export function buildCollectionItemListNextCursor(
  items: CollectionItemCursorSource[],
  limit: number
): string | undefined {
  if (items.length < limit) return undefined;

  const last = items[items.length - 1];
  return encodeCollectionItemListCursor(buildCollectionItemListCursor(last));
}
