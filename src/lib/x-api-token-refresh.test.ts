import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const prismaMock = vi.hoisted(() => {
  const user = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  return {
    user,
    // Interactive transaction: run the callback against a tx that shares the
    // user mock and accepts the advisory-lock $executeRaw call.
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ user, $executeRaw: vi.fn(async () => 0) })
    ),
  };
});

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
        tokenRefreshedAt: expect.any(Date),
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

  it("collapses concurrent refreshes into a single token exchange", async () => {
    const { encrypt } = await import("./encryption");
    const expired = {
      accessToken: encrypt("expired-access-token"),
      tokenExpiresAt: new Date(Date.now() - 1_000),
    };
    prismaMock.user.findUnique.mockResolvedValue({
      ...expired,
      refreshToken: encrypt("refresh-token"),
    });

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
    const [a, b] = await Promise.all([
      getFreshXAccessToken("user-1"),
      getFreshXAccessToken("user-1"),
    ]);

    expect(a).toBe("fresh-access-token");
    expect(b).toBe("fresh-access-token");
    // Both callers share one in-flight refresh: one exchange, one DB write.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it("skips the exchange when another holder refreshed while waiting for the lock", async () => {
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique
      // Initial read: token looks expired.
      .mockResolvedValueOnce({
        accessToken: encrypt("expired-access-token"),
        tokenExpiresAt: new Date(Date.now() - 1_000),
      })
      // Re-read under the advisory lock: a concurrent holder already refreshed.
      .mockResolvedValueOnce({
        accessToken: encrypt("already-refreshed-token"),
        refreshToken: encrypt("rotated-refresh-token"),
        tokenExpiresAt: new Date(Date.now() + 2 * 60 * 60_000),
      });

    const { getFreshXAccessToken } = await import("./x-api");
    const token = await getFreshXAccessToken("user-1");

    expect(token).toBe("already-refreshed-token");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
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

  it("refreshes and fetches bookmarks with that user's app only", async () => {
    const { encrypt } = await import("./encryption");
    const apps = {
      "user-a": {
        clientId: "client-user-a-1111",
        clientSecret: "secret-user-a-zzzz",
        refresh: "refresh-user-a",
      },
      "user-b": {
        clientId: "client-user-b-2222",
        clientSecret: "secret-user-b-yyyy",
        refresh: "refresh-user-b",
      },
    } as const;

    prismaMock.user.findUnique.mockImplementation(
      async (args: { where: { id: keyof typeof apps } }) => {
        const app = apps[args.where.id];
        if (!app) {
          throw new Error(`refused lookup for ${String(args.where.id)}`);
        }
        return {
          accessToken: encrypt("expired-access-token"),
          refreshToken: encrypt(app.refresh),
          tokenExpiresAt: new Date(Date.now() - 1_000),
          xClientId: encrypt(app.clientId),
          xClientSecret: encrypt(app.clientSecret),
        };
      },
    );
    prismaMock.user.update.mockResolvedValue({});
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/oauth2/token")) {
        const refresh = new URLSearchParams(String(init?.body)).get("refresh_token");
        return new Response(
          JSON.stringify({
            access_token: `access-for-${refresh}`,
            refresh_token: `next-${refresh}`,
            expires_in: 7200,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { fetchBookmarks } = await import("./x-api");
    await fetchBookmarks("user-a", "x-user-a");

    const lookedUp = prismaMock.user.findUnique.mock.calls.map(
      (call) => (call[0] as { where: { id: string } }).where.id,
    );
    expect(lookedUp.length).toBeGreaterThan(0);
    expect(lookedUp.every((id) => id === "user-a")).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-a" } }),
    );

    const tokenCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/oauth2/token"),
    ) as [string, RequestInit];
    const tokenHeader = (tokenCall[1].headers as Record<string, string>).Authorization;
    expect(Buffer.from(tokenHeader.replace(/^Basic /, ""), "base64").toString()).toBe(
      "client-user-a-1111:secret-user-a-zzzz",
    );
    expect(tokenHeader).not.toContain("secret-user-b");
    expect(tokenHeader).not.toContain("twitter-client-secret");

    const bookmarkCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/users/x-user-a/bookmarks"),
    ) as [string, RequestInit];
    expect(bookmarkCall[1].headers).toMatchObject({
      Authorization: "Bearer access-for-refresh-user-a",
    });

    fetchMock.mockClear();
    prismaMock.user.findUnique.mockClear();
    prismaMock.user.update.mockClear();

    await fetchBookmarks("user-b", "x-user-b");
    const bTokenCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/oauth2/token"),
    ) as [string, RequestInit];
    const bHeader = (bTokenCall[1].headers as Record<string, string>).Authorization;
    expect(Buffer.from(bHeader.replace(/^Basic /, ""), "base64").toString()).toBe(
      "client-user-b-2222:secret-user-b-yyyy",
    );
    const bLookups = prismaMock.user.findUnique.mock.calls.map(
      (call) => (call[0] as { where: { id: string } }).where.id,
    );
    expect(bLookups.every((id) => id === "user-b")).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-b" } }),
    );
  });

  it("does not use a still-valid token when a public hosted user has no app", async () => {
    vi.stubEnv("VERCEL", "1");
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: encrypt("still-valid-token"),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
      xClientId: null,
      xClientSecret: null,
    });

    const { getFreshXAccessToken } = await import("./x-api");
    const { XAppCredentialsRequiredError } = await import("./x-app-credentials");

    await expect(getFreshXAccessToken("public-user")).rejects.toBeInstanceOf(
      XAppCredentialsRequiredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "public-user" } }),
    );
  });

  it("uses the host app for the owner when that account has no stored pair", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: encrypt("expired-access-token"),
      refreshToken: encrypt("owner-refresh"),
      tokenExpiresAt: new Date(Date.now() - 1_000),
      xClientId: null,
      xClientSecret: null,
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "owner-access",
          refresh_token: "owner-refresh-next",
          expires_in: 7200,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    prismaMock.user.update.mockResolvedValue({});

    const { getFreshXAccessToken } = await import("./x-api");
    await expect(getFreshXAccessToken("owner-1")).resolves.toBe("owner-access");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const header = (init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(header.replace(/^Basic /, ""), "base64").toString()).toBe(
      "twitter-client-id:twitter-client-secret",
    );
  });

  it("prefers a stored pair over the host app even for the owner", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: encrypt("expired-access-token"),
      refreshToken: encrypt("owner-refresh"),
      tokenExpiresAt: new Date(Date.now() - 1_000),
      xClientId: encrypt("owner-own-client-id"),
      xClientSecret: encrypt("owner-own-client-secret"),
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "owner-access",
          expires_in: 7200,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    prismaMock.user.update.mockResolvedValue({});

    const { getFreshXAccessToken } = await import("./x-api");
    await getFreshXAccessToken("owner-1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const header = (init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(header.replace(/^Basic /, ""), "base64").toString()).toBe(
      "owner-own-client-id:owner-own-client-secret",
    );
    expect(header).not.toContain("twitter-client-secret");
  });

  it("refuses to refresh with the host app when stored credentials cannot be read", async () => {
    const { encrypt } = await import("./encryption");
    prismaMock.user.findUnique.mockResolvedValue({
      accessToken: encrypt("expired-access-token"),
      refreshToken: encrypt("refresh-token"),
      tokenExpiresAt: new Date(Date.now() - 1_000),
      xClientId: "not-ciphertext",
      xClientSecret: encrypt("secret-user-a-zzzz"),
    });

    const { getFreshXAccessToken } = await import("./x-api");
    const { XAppCredentialsRequiredError } = await import("./x-app-credentials");

    await expect(getFreshXAccessToken("user-1")).rejects.toBeInstanceOf(
      XAppCredentialsRequiredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
