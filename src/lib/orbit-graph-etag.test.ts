import { describe, expect, it } from "vitest";

import {
  buildOrbitGraphETag,
  ORBIT_GRAPH_ETAG_WINDOW_MS,
} from "@/lib/orbit-graph-etag";

const base = {
  cacheVersion: 3,
  scope: "library",
  nodeCap: 1000,
  expandKey: "tag-1",
  now: Date.UTC(2026, 5, 11, 12, 5),
};

describe("buildOrbitGraphETag", () => {
  it("returns a stable weak etag for the same inputs", () => {
    expect(buildOrbitGraphETag(base)).toBe(buildOrbitGraphETag(base));
    expect(buildOrbitGraphETag(base)).toMatch(/^W\/"orbit-graph-[a-f0-9]{16}"$/);
  });

  it("stays the same across recomputes within the hour", () => {
    expect(buildOrbitGraphETag({ ...base, now: base.now + 30 * 60_000 })).toBe(
      buildOrbitGraphETag(base)
    );
  });

  it("changes when the library changes or the hour turns", () => {
    const etag = buildOrbitGraphETag(base);
    expect(buildOrbitGraphETag({ ...base, cacheVersion: 4 })).not.toBe(etag);
    expect(
      buildOrbitGraphETag({ ...base, now: base.now + ORBIT_GRAPH_ETAG_WINDOW_MS })
    ).not.toBe(etag);
  });

  it("changes with each deployment", () => {
    expect(buildOrbitGraphETag({ ...base, buildId: "dpl_a" })).not.toBe(
      buildOrbitGraphETag({ ...base, buildId: "dpl_b" })
    );
  });

  it("separates scopes, caps, and expand states", () => {
    const etag = buildOrbitGraphETag(base);
    expect(buildOrbitGraphETag({ ...base, scope: "orbit" })).not.toBe(etag);
    expect(buildOrbitGraphETag({ ...base, nodeCap: 500 })).not.toBe(etag);
    expect(buildOrbitGraphETag({ ...base, expandKey: "" })).not.toBe(etag);
  });
});
