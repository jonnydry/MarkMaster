import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDbUserMock = vi.hoisted(() => vi.fn(async () => ({ id: "user-1" })));
const ORIGINAL_XAI_ENV = {
  XAI_API_KEY: process.env.XAI_API_KEY,
  XAI_ORBIT_MODEL: process.env.XAI_ORBIT_MODEL,
};

vi.mock("@/lib/auth", () => ({
  getDbUser: getDbUserMock,
}));

function restoreEnvValue(key: keyof typeof ORIGINAL_XAI_ENV) {
  const value = ORIGINAL_XAI_ENV[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe("/api/orbit/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnvValue("XAI_API_KEY");
    restoreEnvValue("XAI_ORBIT_MODEL");
  });

  it("returns authenticated Orbit xAI status with the last recoverable failure", async () => {
    const { GET } = await import("./route");

    process.env.XAI_API_KEY = "xai-test";
    process.env.XAI_ORBIT_MODEL = "grok-custom";

    const response = await GET(
      new NextRequest(
        "http://localhost/api/orbit/status?lastFailure=xai_auth"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "misconfigured",
      apiKeyConfigured: true,
      model: "grok-custom",
      privacy: {
        storeDisabled: true,
        zeroDataRetention: null,
      },
      issues: [
        {
          code: "xai_auth",
        },
      ],
    });
  });

  it("rejects unauthenticated status checks", async () => {
    getDbUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/status")
    );

    expect(response.status).toBe(401);
  });
});
