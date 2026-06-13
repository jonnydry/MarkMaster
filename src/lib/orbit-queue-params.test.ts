import { describe, expect, it } from "vitest";

import {
  buildOrbitQueueListQueryString,
  buildOrbitScanCandidatesQueryString,
} from "@/lib/orbit-queue-params";

describe("buildOrbitQueueListQueryString", () => {
  it("includes unaffiliated queue filters and cursor", () => {
    const query = buildOrbitQueueListQueryString({
      orbitView: "all",
      page: 2,
      pageSize: 50,
      sortDirection: "desc",
      search: "react",
      pageCursors: { 2: "cursor-abc" },
    });

    const params = new URLSearchParams(query);
    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("50");
    expect(params.get("sortField")).toBe("bookmarkedAt");
    expect(params.get("sortDirection")).toBe("desc");
    expect(params.get("unaffiliated")).toBe("true");
    expect(params.get("search")).toBe("react");
    expect(params.get("cursor")).toBe("cursor-abc");
  });

  it("pins recent view to page 1", () => {
    const query = buildOrbitQueueListQueryString({
      orbitView: "recent",
      page: 4,
      pageSize: 20,
      sortDirection: "asc",
      search: "",
    });

    expect(new URLSearchParams(query).get("page")).toBe("1");
  });
});

describe("buildOrbitScanCandidatesQueryString", () => {
  it("shares search and sort with the queue but uses candidate limit", () => {
    const query = buildOrbitScanCandidatesQueryString({
      orbitView: "all",
      page: 2,
      pageSize: 50,
      sortDirection: "desc",
      search: "orbit",
      candidateLimit: 120,
    });

    const params = new URLSearchParams(query);
    expect(params.get("limit")).toBe("120");
    expect(params.get("search")).toBe("orbit");
    expect(params.get("unaffiliated")).toBeNull();
  });
});
