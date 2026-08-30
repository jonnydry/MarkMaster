import { describe, expect, it } from "vitest";
import {
  bookmarksQuerySchema,
  createTagSchema,
  MAX_BOOKMARK_QUERY_PAGE,
  MAX_BOOKMARK_TARGETS,
  reorderCollectionItemsSchema,
} from "./validations";

describe("validation schemas", () => {
  it("dedupes bulk bookmark targets and caps request size", () => {
    expect(
      createTagSchema.parse({
        name: "AI",
        bookmarkIds: ["bookmark-1", "bookmark-1", "bookmark-2"],
      }).bookmarkIds
    ).toEqual(["bookmark-1", "bookmark-2"]);

    expect(
      createTagSchema.safeParse({
        name: "AI",
        bookmarkIds: Array.from(
          { length: MAX_BOOKMARK_TARGETS + 1 },
          (_, index) => `bookmark-${index}`
        ),
      }).success
    ).toBe(false);
  });

  it("rejects duplicated reorder item IDs", () => {
    expect(
      reorderCollectionItemsSchema.safeParse({
        items: [
          { bookmarkId: "bookmark-1", sortOrder: 0 },
          { bookmarkId: "bookmark-1", sortOrder: 1 },
        ],
      }).success
    ).toBe(false);
  });

  it("bounds bookmark queries before they reach Prisma", () => {
    expect(
      bookmarksQuerySchema.safeParse({
        page: String(MAX_BOOKMARK_QUERY_PAGE + 1),
      }).success
    ).toBe(false);

    expect(
      bookmarksQuerySchema.safeParse({
        dateFrom: "2026-02-31",
      }).success
    ).toBe(false);

    expect(
      bookmarksQuerySchema.safeParse({
        dateFrom: "2026-05-02",
        dateTo: "2026-05-01",
      }).success
    ).toBe(false);
  });

  it("folds a valid timeZone into date filter values", () => {
    const parsed = bookmarksQuerySchema.parse({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
      timeZone: "America/New_York",
    });

    expect(parsed.dateFrom).toBe("2026-05-01@America/New_York");
    expect(parsed.dateTo).toBe("2026-05-02@America/New_York");

    const withoutZone = bookmarksQuerySchema.parse({ dateFrom: "2026-05-01" });
    expect(withoutZone.dateFrom).toBe("2026-05-01");
  });

  it("rejects malformed or unknown time zones", () => {
    expect(
      bookmarksQuerySchema.safeParse({
        dateFrom: "2026-05-01",
        timeZone: "America/New_York'; DROP TABLE --",
      }).success
    ).toBe(false);

    expect(
      bookmarksQuerySchema.safeParse({
        dateFrom: "2026-05-01",
        timeZone: "Not/AZone",
      }).success
    ).toBe(false);
  });
});
