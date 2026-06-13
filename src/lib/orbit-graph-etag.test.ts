import { describe, expect, it } from "vitest";

import { buildOrbitGraphETag } from "@/lib/orbit-graph-etag";

describe("buildOrbitGraphETag", () => {
  it("returns a stable weak etag for the same inputs", () => {
    const input = {
      cacheVersion: 3,
      scope: "library" as const,
      nodeCap: 1000,
      expandKey: "tag-1",
      generatedAt: "2026-06-11T12:00:00.000Z",
    };

    expect(buildOrbitGraphETag(input)).toBe(buildOrbitGraphETag(input));
    expect(buildOrbitGraphETag(input)).toMatch(/^W\/"orbit-graph-[a-f0-9]{16}"$/);
  });

  it("changes when the payload fingerprint changes", () => {
    const base = {
      cacheVersion: 1,
      scope: "library" as const,
      nodeCap: 1000,
      expandKey: "",
      generatedAt: "2026-06-11T12:00:00.000Z",
    };

    expect(buildOrbitGraphETag(base)).not.toBe(
      buildOrbitGraphETag({ ...base, generatedAt: "2026-06-11T12:00:01.000Z" })
    );
  });
});
