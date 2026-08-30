import { afterEach, describe, expect, it, vi } from "vitest";

import { debugAccessDeniedResponse } from "./debug-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("debugAccessDeniedResponse in production", () => {
  it("fails closed with a 404 when OWNER_USER_ID is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = debugAccessDeniedResponse({ id: "user-1" });

    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
    await expect(response!.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("fails closed with a 404 when OWNER_USER_ID is whitespace-only", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OWNER_USER_ID", "   ");

    const response = debugAccessDeniedResponse({ id: "user-1" });

    expect(response?.status).toBe(404);
  });

  it("returns a 404 (not 403) for an authenticated non-owner", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OWNER_USER_ID", "owner-1");

    const response = debugAccessDeniedResponse({ id: "someone-else" });

    // 404 so the endpoint's existence is not advertised to non-owners.
    expect(response?.status).toBe(404);
    await expect(response!.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("allows the owner through", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OWNER_USER_ID", "owner-1");

    expect(debugAccessDeniedResponse({ id: "owner-1" })).toBeNull();
  });
});

describe("debugAccessDeniedResponse outside production", () => {
  it("allows any authenticated user when OWNER_USER_ID is unset", () => {
    expect(debugAccessDeniedResponse({ id: "anyone" })).toBeNull();
  });

  it("restricts to the owner with a 403 when OWNER_USER_ID is set", async () => {
    vi.stubEnv("OWNER_USER_ID", "owner-1");

    const response = debugAccessDeniedResponse({ id: "someone-else" });

    expect(response?.status).toBe(403);
    await expect(response!.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("allows the owner when OWNER_USER_ID is set", () => {
    vi.stubEnv("OWNER_USER_ID", "owner-1");

    expect(debugAccessDeniedResponse({ id: "owner-1" })).toBeNull();
  });

  it("trims OWNER_USER_ID before comparing", () => {
    vi.stubEnv("OWNER_USER_ID", "  owner-1  ");

    expect(debugAccessDeniedResponse({ id: "owner-1" })).toBeNull();
  });
});
