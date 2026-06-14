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

vi.mock("./prisma", () => ({ prisma: prismaMock }));

describe("authSignInCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
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
  });
});

describe("authJwtCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds dbUser on initial sign-in", async () => {
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

    prismaMock.user.findUnique.mockResolvedValue(dbUser);

    const token = await authJwtCallback({
      token: {},
      account: { providerAccountId: "x-1" } as Account,
      profile: { data: { username: "alice" }, name: "Alice" } as Profile,
    });

    expect(token.dbUser).toEqual(dbUser);
    expect(token.xId).toBe("x-1");
    expect(token.username).toBe("alice");
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

    expect(token.dbUser?.lastSyncAt).toEqual(syncedAt);
    expect(token.dbUser?.syncXFolders).toBe(true);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { lastSyncAt: true, syncXFolders: true },
    });
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
