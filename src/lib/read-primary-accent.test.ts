import { describe, expect, it } from "vitest";

import { cssColorToHex } from "@/lib/read-primary-accent";

describe("cssColorToHex", () => {
  it("normalizes 6-digit hex", () => {
    expect(cssColorToHex("#fb923c")).toBe("#fb923c");
  });

  it("expands 3-digit hex", () => {
    expect(cssColorToHex("#f90")).toBe("#ff9900");
  });

  it("converts rgb()", () => {
    expect(cssColorToHex("rgb(251, 146, 60)")).toBe("#fb923c");
  });

  it("converts rgba()", () => {
    expect(cssColorToHex("rgba(37, 99, 235, 0.8)")).toBe("#2563eb");
  });

  it("returns undefined for unsupported values", () => {
    expect(cssColorToHex("oklch(0.7 0.15 250)")).toBeUndefined();
    expect(cssColorToHex("")).toBeUndefined();
  });
});
