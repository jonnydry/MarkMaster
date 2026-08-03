import { describe, expect, it } from "vitest";
import { getSafeRelativeCallbackUrl } from "./safe-redirect";

describe("getSafeRelativeCallbackUrl", () => {
  it("accepts same-origin paths", () => {
    expect(getSafeRelativeCallbackUrl("/share/abc?page=2")).toBe(
      "/share/abc?page=2"
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "javascript:alert(1)",
    "/dashboard\nLocation: https://evil.example",
  ])("rejects unsafe callback %s", (value) => {
    expect(getSafeRelativeCallbackUrl(value)).toBe("/dashboard");
  });
});
