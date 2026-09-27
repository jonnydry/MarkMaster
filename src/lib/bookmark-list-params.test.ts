import { describe, expect, it } from "vitest";

import {
  buildBookmarkListQueryString,
  defaultBookmarkListQueryString,
} from "@/lib/bookmark-list-params";
import { ORBIT_RECENT_PAGE_SIZE } from "@/lib/orbit-navigation";
import { buildOrbitQueueListQueryString } from "@/lib/orbit-queue-params";

describe("bookmark list query strings", () => {
  it("builds the default feed the dashboard and nav prefetch share", () => {
    expect(defaultBookmarkListQueryString()).toBe(
      "page=1&limit=20&search=&sortField=tweetCreatedAt&sortDirection=desc&mediaFilter=all&authorFilter=&tagFilter="
    );
  });

  it("keeps date and cursor params behind the base feed", () => {
    expect(
      buildBookmarkListQueryString({
        page: 2,
        sortField: "bookmarkedAt",
        sortDirection: "desc",
        mediaFilter: "all",
        dateFrom: "2026-01-01",
        timeZone: "UTC",
        cursor: "abc",
      })
    ).toBe(
      "page=2&limit=20&search=&sortField=bookmarkedAt&sortDirection=desc&mediaFilter=all&authorFilter=&tagFilter=&dateFrom=2026-01-01&timeZone=UTC&cursor=abc"
    );
  });
});

describe("default orbit queue prefetch", () => {
  it("matches the recent queue the Orbit page loads with no filters", () => {
    expect(
      buildOrbitQueueListQueryString({
        orbitView: "recent",
        page: 1,
        pageSize: ORBIT_RECENT_PAGE_SIZE,
        sortDirection: "desc",
        search: "",
      })
    ).toBe("page=1&limit=12&sortField=bookmarkedAt&sortDirection=desc&unaffiliated=true");
  });
});
