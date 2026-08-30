import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isShareLinkExpired } from "./share-content";

describe("isShareLinkExpired", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats a missing expiry as never expiring", () => {
    expect(isShareLinkExpired(null)).toBe(false);
    expect(isShareLinkExpired(undefined)).toBe(false);
  });

  it("is not expired before the expiry instant", () => {
    expect(isShareLinkExpired(new Date("2026-08-30T12:00:00.001Z"))).toBe(false);
    expect(isShareLinkExpired(new Date("2026-09-06T12:00:00.000Z"))).toBe(false);
  });

  it("is expired at and after the expiry instant", () => {
    expect(isShareLinkExpired(new Date("2026-08-30T12:00:00.000Z"))).toBe(true);
    expect(isShareLinkExpired(new Date("2026-08-29T12:00:00.000Z"))).toBe(true);
  });

  it("accepts ISO strings, as returned by unstable_cache hits", () => {
    expect(isShareLinkExpired("2026-08-29T12:00:00.000Z")).toBe(true);
    expect(isShareLinkExpired("2026-09-29T12:00:00.000Z")).toBe(false);
  });
});
