import { describe, expect, it } from "vitest";
import { isLightweightApiRequest } from "./lightweight-api-routes";

describe("isLightweightApiRequest", () => {
  it("allows sync status polling", () => {
    expect(isLightweightApiRequest("/api/bookmarks/sync", "GET")).toBe(true);
    expect(isLightweightApiRequest("/api/bookmarks/sync", "HEAD")).toBe(true);
    expect(isLightweightApiRequest("/api/bookmarks/sync", "POST")).toBe(false);
  });

  it("allows flywheel beacons", () => {
    expect(isLightweightApiRequest("/api/flywheel", "POST")).toBe(true);
    expect(isLightweightApiRequest("/api/flywheel", "GET")).toBe(false);
  });

  it("does not allow other routes", () => {
    expect(isLightweightApiRequest("/api/bookmarks", "GET")).toBe(false);
    expect(isLightweightApiRequest("/api/tags", "GET")).toBe(false);
  });
});
