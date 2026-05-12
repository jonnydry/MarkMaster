import { describe, expect, it } from "vitest";

import {
  buildOrbitIntentHref,
  parseOrbitUrlState,
} from "@/lib/orbit-navigation";

describe("buildOrbitIntentHref", () => {
  it("builds an oldest-first Orbit handoff from Analytics", () => {
    expect(
      buildOrbitIntentHref({
        intent: "oldest",
        orbitQueueCount: 37,
        untaggedOldestAt: "2026-03-04T12:30:00.000Z",
      })
    ).toBe(
      "/orbit?intent=oldest&queueCount=37&view=all&sort=oldest&page=1&oldestAt=2026-03-04"
    );
  });

  it("keeps small backlog handoffs on the recent queue slice", () => {
    expect(
      buildOrbitIntentHref({
        intent: "backlog",
        orbitQueueCount: 8,
      })
    ).toBe("/orbit?intent=backlog&queueCount=8&view=recent&sort=newest");
  });

  it("opens larger backlog handoffs in the pageable all queue", () => {
    expect(
      buildOrbitIntentHref({
        intent: "backlog",
        orbitQueueCount: 18,
      })
    ).toBe(
      "/orbit?intent=backlog&queueCount=18&view=all&sort=newest&page=1"
    );
  });

  it("falls back to plain Orbit when Analytics has no queue", () => {
    expect(
      buildOrbitIntentHref({
        intent: "oldest",
        orbitQueueCount: 0,
        untaggedOldestAt: "2026-03-04T12:30:00.000Z",
      })
    ).toBe("/orbit");
  });
});

describe("parseOrbitUrlState", () => {
  it("hydrates oldest intent as an all-queue oldest-first view", () => {
    expect(
      parseOrbitUrlState(
        "intent=oldest&queueCount=37&view=recent&sort=newest&page=5&oldestAt=2026-03-04"
      )
    ).toMatchObject({
      intent: "oldest",
      view: "all",
      page: 5,
      sortDirection: "asc",
      queueCount: 37,
      oldestAt: "2026-03-04",
    });
  });

  it("uses queue count to choose a backlog view when view is omitted", () => {
    expect(parseOrbitUrlState("intent=backlog&queueCount=18")).toMatchObject({
      intent: "backlog",
      view: "all",
      page: 1,
      sortDirection: "desc",
      queueCount: 18,
    });
  });

  it("falls back safely for invalid params", () => {
    expect(
      parseOrbitUrlState(
        "intent=unknown&queueCount=not-a-number&view=other&page=-2&oldestAt=nope"
      )
    ).toMatchObject({
      intent: null,
      view: "recent",
      page: 1,
      sortDirection: "desc",
      queueCount: null,
      oldestAt: null,
    });
  });
});
