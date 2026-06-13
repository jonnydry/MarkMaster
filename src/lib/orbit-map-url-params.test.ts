import { describe, expect, it } from "vitest";

import {
  applyOrbitMapSelectionToParams,
  clearOrbitMapSelectionParams,
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
