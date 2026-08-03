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

  it("allows collection mutations to skip proxy api:write (handler applies it)", () => {
    expect(isLightweightApiRequest("/api/collections", "POST")).toBe(true);
    expect(isLightweightApiRequest("/api/collections", "PATCH")).toBe(true);
    expect(isLightweightApiRequest("/api/collections", "GET")).toBe(false);
    expect(isLightweightApiRequest("/api/collections", "HEAD")).toBe(false);
    expect(isLightweightApiRequest("/api/collections/abc", "POST")).toBe(true);
    expect(isLightweightApiRequest("/api/collections/abc/items", "DELETE")).toBe(true);
    expect(isLightweightApiRequest("/api/collections/abc", "GET")).toBe(false);
  });

  it("does not allow other routes", () => {
    expect(isLightweightApiRequest("/api/bookmarks", "GET")).toBe(false);
    expect(isLightweightApiRequest("/api/tags", "GET")).toBe(false);
  });

  it("lets media and export handlers own their specialized limits", () => {
    expect(isLightweightApiRequest("/api/media", "GET")).toBe(true);
    expect(isLightweightApiRequest("/api/media", "POST")).toBe(false);
    expect(isLightweightApiRequest("/api/export", "GET")).toBe(true);
    expect(isLightweightApiRequest("/api/export", "POST")).toBe(false);
  });
});
