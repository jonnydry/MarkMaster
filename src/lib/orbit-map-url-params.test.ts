import { describe, expect, it } from "vitest";

import {
  applyOrbitMapFilterToParams,
  applyOrbitMapSelectionToParams,
  clearOrbitMapSelectionParams,
  parseOrbitMapFilterFromParams,
  parseOrbitMapSelectionFromParams,
} from "@/lib/orbit-map-url-params";

describe("parseOrbitMapSelectionFromParams", () => {
  it("parses explicit select/kind params", () => {
    expect(
      parseOrbitMapSelectionFromParams({
        selectId: "tag-1",
        selectKind: "tag",
        focusBookmarkId: null,
      })
    ).toEqual({ kind: "tag", id: "tag-1" });
  });

  it("falls back to focus bookmark param", () => {
    expect(
      parseOrbitMapSelectionFromParams({
        selectId: null,
        selectKind: null,
        focusBookmarkId: "b1",
      })
    ).toEqual({ kind: "bookmark", id: "b1" });
  });
});

describe("applyOrbitMapSelectionToParams", () => {
  it("writes bookmark selection params", () => {
    const params = new URLSearchParams();
    applyOrbitMapSelectionToParams(params, { kind: "bookmark", id: "b1" });

    expect(params.get("select")).toBe("b1");
    expect(params.get("kind")).toBe("bookmark");
    expect(params.get("bookmark")).toBe("b1");
  });

  it("clears selection params when null", () => {
    const params = new URLSearchParams({
      select: "b1",
      kind: "bookmark",
      bookmark: "b1",
      focus: "b1",
    });

    applyOrbitMapSelectionToParams(params, null);

    expect(params.has("select")).toBe(false);
    expect(params.has("kind")).toBe(false);
    expect(params.has("bookmark")).toBe(false);
    expect(params.has("focus")).toBe(false);
  });
});

describe("orbit map filter params", () => {
  it("defaults unknown values to all", () => {
    expect(parseOrbitMapFilterFromParams(null)).toBe("all");
    expect(parseOrbitMapFilterFromParams("recent")).toBe("recent");
    expect(parseOrbitMapFilterFromParams("loose")).toBe("loose");
    expect(parseOrbitMapFilterFromParams("starred")).toBe("all");
  });

  it("omits the default all filter from the URL", () => {
    const params = new URLSearchParams({ filter: "loose" });
    applyOrbitMapFilterToParams(params, "all");
    expect(params.has("filter")).toBe(false);

    applyOrbitMapFilterToParams(params, "recent");
    expect(params.get("filter")).toBe("recent");
  });
});

describe("clearOrbitMapSelectionParams", () => {
  it("removes all selection-related keys", () => {
    const params = new URLSearchParams({
      select: "x",
      kind: "tag",
      bookmark: "b1",
      focus: "b1",
      anchor: "tag-1",
    });

    clearOrbitMapSelectionParams(params);

    expect([...params.keys()]).toEqual([]);
  });
});
