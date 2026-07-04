import { describe, expect, it } from "vitest";

import {
  offsetInVisualOrder,
  sortGridBookmarksRowMajor,
} from "@/lib/grid-bookmark-navigation";

describe("sortGridBookmarksRowMajor", () => {
  it("interleaves columns row-by-row for horizontal reading order", () => {
    const ids = sortGridBookmarksRowMajor([
      { id: "a", top: 100, left: 100 },
      { id: "d", top: 220, left: 100 },
      { id: "b", top: 110, left: 420 },
      { id: "c", top: 230, left: 420 },
    ]);

    expect(ids).toEqual(["a", "b", "d", "c"]);
  });
});

describe("offsetInVisualOrder", () => {
  const order = ["a", "b", "c", "d"];

  it("moves forward and backward through visual order", () => {
    expect(offsetInVisualOrder(order, "a", 1)).toBe("b");
    expect(offsetInVisualOrder(order, "b", -1)).toBe("a");
    expect(offsetInVisualOrder(order, "c", 1)).toBe("d");
  });

  it("clamps at the ends of the list", () => {
    expect(offsetInVisualOrder(order, "d", 1)).toBe("d");
    expect(offsetInVisualOrder(order, "a", -1)).toBe("a");
  });

  it("starts from the first item when nothing is selected", () => {
    expect(offsetInVisualOrder(order, null, 1)).toBe("a");
    expect(offsetInVisualOrder(order, null, -1)).toBe("a");
  });
});
