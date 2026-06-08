import { describe, expect, it } from "vitest";
import { formatCompactCount } from "./format-metrics";

describe("formatCompactCount", () => {
  it("formats millions and thousands", () => {
    expect(formatCompactCount(1_500_000)).toBe("1.5M");
    expect(formatCompactCount(12_400)).toBe("12.4K");
  });

  it("formats small values with locale grouping", () => {
    expect(formatCompactCount(999)).toBe("999");
    expect(formatCompactCount(1200)).toBe("1.2K");
  });
});
