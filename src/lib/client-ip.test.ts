import { afterEach, describe, expect, it, vi } from "vitest";

import { getClientIp, getTrustedProxyHops } from "./client-ip";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTrustedProxyHops", () => {
  it("defaults to 1 when TRUSTED_PROXY_HOPS is unset", () => {
    expect(getTrustedProxyHops()).toBe(1);
  });

  it("parses a valid integer value", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(getTrustedProxyHops()).toBe(2);
  });

  it("accepts 0 (directly exposed, x-forwarded-for untrusted)", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(getTrustedProxyHops()).toBe(0);
  });

  it("falls back to the default for negative values", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "-3");
    expect(getTrustedProxyHops()).toBe(1);
  });

  it("falls back to the default for non-numeric values", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "banana");
    expect(getTrustedProxyHops()).toBe(1);
  });
});

describe("getClientIp", () => {
  it("returns 'unknown' when no relevant headers are present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("uses the rightmost x-forwarded-for entry with the default single trusted hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 203.0.113.7",
    });
    // 6.6.6.6 is client-prepended and spoofable; the trusted edge appended 203.0.113.7.
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("returns a single x-forwarded-for entry as-is", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.4" });
    expect(getClientIp(headers)).toBe("198.51.100.4");
  });

  it("counts hops in from the right when TRUSTED_PROXY_HOPS=2", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1",
    });
    // With 2 trusted proxies, the real client IP is the second entry from the right.
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("does not let a spoofed prepended entry win under the default hop count", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9",
    });
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("ignores x-forwarded-for entirely when TRUSTED_PROXY_HOPS=0", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6",
      "x-real-ip": "203.0.113.10",
    });
    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("returns 'unknown' with hops=0 and no x-real-ip", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6" });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("clamps to the leftmost entry when hops exceed the number of entries", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "5");
    const headers = new Headers({
      "x-forwarded-for": "192.0.2.1, 10.0.0.1",
    });
    expect(getClientIp(headers)).toBe("192.0.2.1");
  });

  it("trims whitespace and drops empty entries in x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "  1.2.3.4  , ,  203.0.113.11  ",
    });
    expect(getClientIp(headers)).toBe("203.0.113.11");
  });

  it("falls back to x-real-ip when x-forwarded-for contains only separators", () => {
    const headers = new Headers({
      "x-forwarded-for": " , , ",
      "x-real-ip": "203.0.113.12",
    });
    expect(getClientIp(headers)).toBe("203.0.113.12");
  });

  it("trims x-real-ip and treats a whitespace-only value as absent", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "  203.0.113.13  " }))).toBe(
      "203.0.113.13"
    );
    expect(getClientIp(new Headers({ "x-real-ip": "   " }))).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip when trusted hops > 0", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.14",
      "x-real-ip": "203.0.113.15",
    });
    expect(getClientIp(headers)).toBe("203.0.113.14");
  });
});
