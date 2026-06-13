import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("./prisma", () => ({ prisma: prismaMock }));

describe("getFreshXAccessToken", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("AUTH_TWITTER_ID", "twitter-client-id");
    vi.stubEnv("AUTH_TWITTER_SECRET", "twitter-client-secret");
    vi.stubGlobal("fetch", fetchMock);
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: encrypt("valid-access-token"),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the stored access token when it is not near expiry", async () => {
    const { getFreshXAccessToken } = await import("./x-api");

    await expect(getFreshXAccessToken("user-1")).resolves.toBe(
      "valid-access-token",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refreshes the token when expiry is within the 60s buffer", async () => {
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        accessToken: encrypt("expired-access-token"),
        tokenExpiresAt: new Date(Date.now() + 30_000),
      })
      .mockResolvedValueOnce({ refreshToken: encrypt("refresh-token") });

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 7200,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    prismaMock.user.update.mockResolvedValue({});

    const { getFreshXAccessToken } = await import("./x-api");
    const token = await getFreshXAccessToken("user-1");

    expect(token).toBe("fresh-access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.x.com/2/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(requestInit.body)).toContain("grant_type=refresh_token");
    expect(String(requestInit.body)).toContain("refresh_token=refresh-token");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        tokenExpiresAt: expect.any(Date),
      },
    });

    const { decrypt } = await import("./encryption");
    const updateArgs = prismaMock.user.update.mock.calls[0][0] as {
      data: { accessToken: string; refreshToken: string };
    };
    expect(decrypt(updateArgs.data.accessToken)).toBe("fresh-access-token");
    expect(decrypt(updateArgs.data.refreshToken)).toBe("fresh-refresh-token");
  });

  it("keeps the previous refresh token when the provider omits a new one", async () => {
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        accessToken: encrypt("expired-access-token"),
        tokenExpiresAt: new Date(Date.now() - 1_000),
      })
      .mockResolvedValueOnce({ refreshToken: encrypt("stable-refresh-token") });

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "fresh-access-token",
          expires_in: 7200,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    prismaMock.user.update.mockResolvedValue({});

    const { getFreshXAccessToken } = await import("./x-api");
    await getFreshXAccessToken("user-1");

    const { decrypt } = await import("./encryption");
    const updateArgs = prismaMock.user.update.mock.calls[0][0] as {
      data: { refreshToken: string };
    };
    expect(decrypt(updateArgs.data.refreshToken)).toBe("stable-refresh-token");
  });

  it("throws when the refresh endpoint returns an error", async () => {
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        accessToken: encrypt("expired-access-token"),
        tokenExpiresAt: new Date(Date.now() - 1_000),
      })
      .mockResolvedValueOnce({ refreshToken: encrypt("refresh-token") });

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    const { getFreshXAccessToken } = await import("./x-api");

    await expect(getFreshXAccessToken("user-1")).rejects.toThrow(
      /Token refresh failed/,
    );
  });
});
