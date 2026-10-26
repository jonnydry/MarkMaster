import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("pending X app cookie", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("seals and opens a client id and secret without leaving them in the cookie", async () => {
    const { openXAppPending, sealXAppPending } = await import("./x-app-pending");
    const clientId = "pending-client-id-1234";
    const clientSecret = "pending-client-secret-zzzz";

    const sealed = sealXAppPending(clientId, clientSecret);

    expect(sealed).not.toContain(clientId);
    expect(sealed).not.toContain(clientSecret);
    expect(sealed.split(":")).toHaveLength(3);
    expect(openXAppPending(sealed)).toEqual({ clientId, clientSecret });
  });

  it("rejects a missing, tampered, or wrong-version cookie", async () => {
    const { encrypt } = await import("./encryption");
    const { openXAppPending, sealXAppPending } = await import("./x-app-pending");

    expect(openXAppPending(null)).toBeNull();
    expect(openXAppPending("")).toBeNull();
    expect(openXAppPending(`${sealXAppPending("abcdefghij", "secretvalue")}x`)).toBeNull();
    expect(openXAppPending(encrypt(JSON.stringify({ v: 2, clientId: "abcdefghij", clientSecret: "secretvalue" })))).toBeNull();
    expect(openXAppPending(encrypt(JSON.stringify({ v: 1, clientId: "  ", clientSecret: "secretvalue" })))).toBeNull();
  });

  it("limits the cookie to the auth path", async () => {
    const { xAppPendingCookieOptions } = await import("./x-app-pending");
    expect(xAppPendingCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/api/auth",
      secure: false,
    });
    expect(xAppPendingCookieOptions(0).maxAge).toBe(0);
  });
});
