import { describe, expect, it } from "vitest";

import {
  buildCollectionItemListCursor,
  buildPrismaCollectionItemKeysetFilter,
  decodeCollectionItemListCursor,
  encodeCollectionItemListCursor,
} from "./collection-item-keyset";

describe("collection item keyset cursors", () => {
  const item = {
    id: "item-1",
    sortOrder: 4,
  };

  it("round-trips cursor payloads", () => {
    const cursor = buildCollectionItemListCursor(item);
    const encoded = encodeCollectionItemListCursor(cursor);

    expect(decodeCollectionItemListCursor(encoded)).toEqual(cursor);
  });

  it("builds ascending sortOrder keyset filters", () => {
    const cursor = buildCollectionItemListCursor(item);

    expect(buildPrismaCollectionItemKeysetFilter(cursor)).toEqual({
      OR: [
        { sortOrder: { gt: 4 } },
        { sortOrder: 4, id: { gt: "item-1" } },
      ],
    });
  });
});
