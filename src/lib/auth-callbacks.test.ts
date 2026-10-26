import { encode } from "@auth/core/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Profile } from "next-auth";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const pendingCookies = vi.hoisted(() => new Map<string, string>());

vi.mock("./prisma", () => ({ prisma: prismaMock }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () =>
      [...pendingCookies.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => {
      const value = pendingCookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      pendingCookies.set(name, value);
    },
  }),
}));

describe("authSignInCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingCookies.clear();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-not-real");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects sign-in when account or profile is missing", async () => {
    const { authSignInCallback } = await import("./auth-callbacks");

    expect(await authSignInCallback({ account: null, profile: undefined })).toBe(
      false,
    );
  });

  it("rejects sign-in when access_token is missing", async () => {
    const { authSignInCallback } = await import("./auth-callbacks");

    const result = await authSignInCallback({
      account: { providerAccountId: "x-1" } as Account,
      profile: { name: "Test" } as Profile,
    });

    expect(result).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("creates a new user with encrypted tokens on first sign-in", async () => {
    const { authSignInCallback } = await import("./auth-callbacks");

    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "user-1" });

    const result = await authSignInCallback({
      account: {
        providerAccountId: "x-1",
        access_token: "access-plain",
        refresh_token: "refresh-plain",
        expires_at: 1_700_000_000,
      } as Account,
      profile: {
        data: {
          username: "alice",
          name: "Alice",
          profile_image_url: "https://example.com/a.jpg",
        },
      } as Profile,
    });

    expect(result).toBe(true);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        xId: "x-1",
        username: "alice",
        displayName: "Alice",
        profileImageUrl: "https://example.com/a.jpg",
        accessToken: expect.not.stringMatching(/^access-plain$/),
        refreshToken: expect.not.stringMatching(/^refresh-plain$/),
        tokenExpiresAt: new Date(1_700_000_000_000),
      }),
    });
    const created = prismaMock.user.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(created.data).not.toHaveProperty("xClientId");
    expect(created.data).not.toHaveProperty("xClientSecret");
  });

  it("updates an existing user and preserves refresh token when provider omits it", async () => {
    const { authSignInCallback } = await import("./auth-callbacks");

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      refreshToken: "stored-refresh-ciphertext",
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-1" });

    const result = await authSignInCallback({
      account: {
        providerAccountId: "x-1",
        access_token: "new-access",
      } as Account,
      profile: { data: { username: "alice", name: "Alice" } } as Profile,
    });

    expect(result).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        refreshToken: "stored-refresh-ciphertext",
        accessToken: expect.not.stringMatching(/^new-access$/),
      }),
    });
    const updated = prismaMock.user.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updated.data).not.toHaveProperty("xClientId");
    expect(updated.data).not.toHaveProperty("xClientSecret");
  });

  it("stores the pending X app encrypted on first sign-in and clears the cookie", async () => {
    const { authSignInCallback } = await import("./auth-callbacks");
    const { decrypt } = await import("./encryption");
    const { sealXAppPending, X_APP_PENDING_COOKIE } = await import("./x-app-pending");

    const clientId = "pending-client-id-1234";
    const clientSecret = "pending-client-secret-zzzz";
    pendingCookies.set(X_APP_PENDING_COOKIE, sealXAppPending(clientId, clientSecret));
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "user-1" });

    const result = await authSignInCallback({
      account: {
        providerAccountId: "x-1",
        access_token: "access-plain",
        refresh_token: "refresh-plain",
        expires_at: 1_700_000_000,
      } as Account,
      profile: { data: { username: "alice", name: "Alice" } } as Profile,
    });

    expect(result).toBe(true);
    const created = prismaMock.user.create.mock.calls[0]?.[0] as {
      data: { xClientId: string; xClientSecret: string };
    };
    expect(created.data.xClientId).not.toContain(clientId);
    expect(created.data.xClientSecret).not.toContain(clientSecret);
    expect(decrypt(created.data.xClientId)).toBe(clientId);
    expect(decrypt(created.data.xClientSecret)).toBe(clientSecret);
    expect(pendingCookies.get(X_APP_PENDING_COOKIE)).toBe("");
  });

  it("does not apply a pending X app cookie over an already signed-in account", async () => {
    const { authSignInCallback } = await import("./auth-callbacks");
    const { sealXAppPending, X_APP_PENDING_COOKIE } = await import("./x-app-pending");
    const { getSessionCookieName } = await import("./auth-edge");

    const cookieName = getSessionCookieName();
    const session = await encode({
      token: { sub: "other-subject", dbUser: { id: "user-already" } },
      secret: "test-auth-secret-not-real",
      salt: cookieName,
    });
    pendingCookies.set(cookieName, session);
    pendingCookies.set(
      X_APP_PENDING_COOKIE,
      sealXAppPending("intruder-client-id", "intruder-client-secret")
    );
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      refreshToken: "stored-refresh-ciphertext",
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-1" });

    const result = await authSignInCallback({
      account: {
        providerAccountId: "x-1",
        access_token: "new-access",
        refresh_token: "new-refresh",
      } as Account,
      profile: { data: { username: "alice", name: "Alice" } } as Profile,
    });

    expect(result).toBe(true);
    const updated = prismaMock.user.update.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updated.data).not.toHaveProperty("xClientId");
    expect(updated.data).not.toHaveProperty("xClientSecret");
    expect(JSON.stringify(updated.data)).not.toContain("intruder-client-secret");
  });
});

describe("authJwtCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds dbUser and stamps sessionVersion on initial sign-in", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");
    const dbUser = {
      id: "user-1",
      xId: "x-1",
      username: "alice",
      displayName: "Alice",
      profileImageUrl: null,
      lastSyncAt: null,
      syncXFolders: false,
    };

    prismaMock.user.findUnique.mockResolvedValue({ ...dbUser, sessionVersion: 3 });

    const token = await authJwtCallback({
      token: {},
      account: { providerAccountId: "x-1" } as Account,
      profile: { data: { username: "alice" }, name: "Alice" } as Profile,
    });

    expect(token).not.toBeNull();
    expect(token?.dbUser).toEqual(dbUser);
    expect(token?.sessionVersion).toBe(3);
    expect(token?.sessionValidatedAt).toEqual(expect.any(Number));
    expect(token?.xId).toBe("x-1");
    expect(token?.username).toBe("alice");
  });

  it("refreshes lastSyncAt when trigger is update", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");
    const syncedAt = new Date("2026-06-11T10:00:00.000Z");

    prismaMock.user.findUnique.mockResolvedValue({
      lastSyncAt: syncedAt,
      syncXFolders: true,
    });

    const token = await authJwtCallback({
      token: {
        dbUser: {
          id: "user-1",
          xId: "x-1",
          username: "alice",
          displayName: "Alice",
          profileImageUrl: null,
          lastSyncAt: null,
          syncXFolders: false,
        },
      },
      trigger: "update",
    });

    expect(token?.dbUser?.lastSyncAt).toEqual(syncedAt);
    expect(token?.dbUser?.syncXFolders).toBe(true);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { lastSyncAt: true, syncXFolders: true },
    });
  });
});

describe("authJwtCallback sessionVersion revalidation", () => {
  const dbUser = {
    id: "user-1",
    xId: "x-1",
    username: "alice",
    displayName: "Alice",
    profileImageUrl: null,
    lastSyncAt: null,
    syncXFolders: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips the database when the token was validated recently", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");

    const token = await authJwtCallback({
      token: {
        dbUser,
        sessionVersion: 1,
        sessionValidatedAt: Date.now() - 1000,
      },
    });

    expect(token).not.toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the stored sessionVersion no longer matches", async () => {
    const { authJwtCallback, SESSION_REVALIDATE_INTERVAL_MS } = await import(
      "./auth-callbacks"
    );

    prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 2 });

    const token = await authJwtCallback({
      token: {
        dbUser,
        sessionVersion: 1,
        sessionValidatedAt: Date.now() - SESSION_REVALIDATE_INTERVAL_MS - 1,
      },
    });

    expect(token).toBeNull();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { sessionVersion: true },
    });
  });

  it("returns null when the user row is gone", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");

    prismaMock.user.findUnique.mockResolvedValue(null);

    const token = await authJwtCallback({
      token: { dbUser, sessionVersion: 1 },
    });

    expect(token).toBeNull();
  });

  it("re-stamps the token when the version still matches", async () => {
    const { authJwtCallback, SESSION_REVALIDATE_INTERVAL_MS } = await import(
      "./auth-callbacks"
    );

    prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 1 });
    const staleValidatedAt = Date.now() - SESSION_REVALIDATE_INTERVAL_MS - 1;

    const token = await authJwtCallback({
      token: {
        dbUser,
        sessionVersion: 1,
        sessionValidatedAt: staleValidatedAt,
      },
    });

    expect(token).not.toBeNull();
    expect(token?.sessionValidatedAt).toBeGreaterThan(staleValidatedAt);
  });

  it("adopts the current version for tokens minted before sessionVersion existed", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");

    prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 4 });

    const token = await authJwtCallback({ token: { dbUser } });

    expect(token).not.toBeNull();
    expect(token?.sessionVersion).toBe(4);
  });

  it("fails open on database errors without stamping validation time", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");

    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));

    const token = await authJwtCallback({
      token: { dbUser, sessionVersion: 1 },
    });

    expect(token).not.toBeNull();
    expect(token?.sessionValidatedAt).toBeUndefined();
  });

  it("leaves legacy tokens without dbUser untouched", async () => {
    const { authJwtCallback } = await import("./auth-callbacks");

    const token = await authJwtCallback({ token: { xId: "x-legacy" } });

    expect(token).not.toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("authSessionCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces dbUser from the JWT without a database lookup", async () => {
    const { authSessionCallback } = await import("./auth-callbacks");
    const dbUser = {
      id: "user-1",
      xId: "x-1",
      username: "alice",
      displayName: "Alice",
      profileImageUrl: null,
      lastSyncAt: null,
      syncXFolders: false,
    };

    const session = await authSessionCallback({
      session: { user: { name: "Alice" }, expires: "2099-01-01" },
      token: { dbUser },
    });

    expect(session.dbUser).toEqual(dbUser);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to prisma when legacy JWT lacks dbUser", async () => {
    const { authSessionCallback } = await import("./auth-callbacks");
    const dbUser = {
      id: "user-1",
      xId: "x-legacy",
      username: "legacy",
      displayName: "Legacy",
      profileImageUrl: null,
      lastSyncAt: null,
      syncXFolders: false,
    };

    prismaMock.user.findUnique.mockResolvedValue(dbUser);

    const session = await authSessionCallback({
      session: { user: {}, expires: "2099-01-01" },
      token: { xId: "x-legacy" },
    });

    expect(session.dbUser).toEqual(dbUser);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { xId: "x-legacy" },
      select: {
        id: true,
        xId: true,
        username: true,
        displayName: true,
        profileImageUrl: true,
        lastSyncAt: true,
        syncXFolders: true,
      },
    });
  });
});
