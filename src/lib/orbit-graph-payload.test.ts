import { describe, expect, it } from "vitest";

import { readOrbitGraphPayload } from "./orbit-graph-payload";

describe("readOrbitGraphPayload", () => {
  it("accepts a well-formed graph in tests", () => {
    const payload = readOrbitGraphPayload({
      nodes: [{ kind: "core", id: "orbit-index", totalBookmarks: 0, looseBookmarks: 0 }],
      edges: [],
      stats: {
        tagCount: 0,
        userCollectionCount: 0,
        xFolderCount: 0,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
      nodeCap: 1000,
    });
    expect(payload.nodes).toHaveLength(1);
    expect(payload.nodeCap).toBe(1000);
  });

  it("rejects a payload that is not a graph", () => {
    expect(() => readOrbitGraphPayload({ error: "nope" })).toThrow(
      /did not match expected shape/
    );
  });
});
