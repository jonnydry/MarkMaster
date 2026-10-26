import { encode } from "@auth/core/jwt";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const AUTH_SECRET = "test-auth-secret-not-real";
const HOST_ID = "host-client-id-should-not-leak";
const HOST_SECRET = "host-client-secret-should-not-leak";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("./prisma", () => ({
  prisma: {
    user: { findUnique },
  },
}));

type StoredRow = { xClientId: string | null; xClientSecret: string | null };

async function sessionRequest(userId: string, path: string, extraCookie = "") {
  const { getSessionCookieName } = await import("./auth-edge");
  const name = getSessionCookieName();
  const token = await encode({
    token: { sub: "authjs-subject", dbUser: { id: userId } },
    secret: AUTH_SECRET,
    salt: name,
  });
  const cookie = extraCookie
    ? `${name}=${token}; ${extraCookie}`
    : `${name}=${token}`;
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie },
  });
}

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("per-user X app credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
    vi.stubEnv("AUTH_TWITTER_ID", HOST_ID);
    vi.stubEnv("AUTH_TWITTER_SECRET", HOST_SECRET);
    findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a stored pair and reports only a last-4 hint", async () => {
    const {
      encryptXAppCredentials,
      resolveXAppCredentialsFromRow,
      xAppStatusFromRow,
    } = await import("./x-app-credentials");
    const { decrypt } = await import("./encryption");

    const clientId = "user-client-id-1234";
    const clientSecret = "user-client-secret-zzzz";
    const stored = encryptXAppCredentials(clientId, clientSecret);

    expect(stored.xClientId).not.toContain(clientId);
    expect(stored.xClientSecret).not.toContain(clientSecret);
    expect(decrypt(stored.xClientId)).toBe(clientId);
    expect(decrypt(stored.xClientSecret)).toBe(clientSecret);
    expect(stored.xClientId).not.toBe(encryptXAppCredentials(clientId, clientSecret).xClientId);

    expect(resolveXAppCredentialsFromRow("user-1", stored)).toEqual({
      clientId,
      clientSecret,
      source: "user",
    });

    const status = xAppStatusFromRow("user-1", stored);
    expect(status).toEqual({
      configured: true,
      unreadable: false,
      clientIdLast4: "1234",
      secretLast4: "zzzz",
      hostAppFallback: false,
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(clientId);
    expect(serialized).not.toContain(clientSecret);
    expect(serialized).not.toContain(HOST_SECRET);
  });

  it("loads credentials with a query scoped to that user id", async () => {
    const { encrypt } = await import("./encryption");
    const rows = new Map<string, StoredRow>([
      [
        "user-a",
        {
          xClientId: encrypt("client-user-a-1111"),
          xClientSecret: encrypt("secret-user-a-zzzz"),
        },
      ],
      [
        "user-b",
        {
          xClientId: encrypt("client-user-b-2222"),
          xClientSecret: encrypt("secret-user-b-yyyy"),
        },
      ],
    ]);
    findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      const row = rows.get(args.where.id);
      if (!row) return null;
      return row;
    });

    const { resolveXAppCredentials } = await import("./x-app-credentials");
    await expect(resolveXAppCredentials("user-a")).resolves.toEqual({
      clientId: "client-user-a-1111",
      clientSecret: "secret-user-a-zzzz",
      source: "user",
    });
    await expect(resolveXAppCredentials("user-b")).resolves.toEqual({
      clientId: "client-user-b-2222",
      clientSecret: "secret-user-b-yyyy",
      source: "user",
    });

    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "user-a" },
      select: { xClientId: true, xClientSecret: true },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "user-b" },
      select: { xClientId: true, xClientSecret: true },
    });
    await expect(resolveXAppCredentials("user-missing")).rejects.toThrow(/User not found/);
  });

  it("uses the host app only for bootstrap and the owner, and prefers a stored pair", async () => {
    const {
      resolveXAppCredentialsFromRow,
      xAppStatusFromRow,
    } = await import("./x-app-credentials");
    const missing = { xClientId: null, xClientSecret: null };

    expect(resolveXAppCredentialsFromRow("anyone", missing)).toEqual({
      clientId: HOST_ID,
      clientSecret: HOST_SECRET,
      source: "bootstrap",
    });
    expect(xAppStatusFromRow("anyone", missing).hostAppFallback).toBe(true);

    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");

    expect(resolveXAppCredentialsFromRow("owner-1", missing)).toEqual({
      clientId: HOST_ID,
      clientSecret: HOST_SECRET,
      source: "owner",
    });
    expect(xAppStatusFromRow("public-user", missing)).toMatchObject({
      configured: false,
      unreadable: false,
      hostAppFallback: false,
      clientIdLast4: null,
      secretLast4: null,
    });

    const { XAppCredentialsRequiredError } = await import("./x-app-credentials");
    expect(() => resolveXAppCredentialsFromRow("public-user", missing)).toThrow(
      XAppCredentialsRequiredError,
    );
    try {
      resolveXAppCredentialsFromRow("public-user", missing);
    } catch (error) {
      expect(error).toBeInstanceOf(XAppCredentialsRequiredError);
      expect((error as Error).message).toMatch(/Settings/);
      expect((error as Error).message).not.toContain(HOST_SECRET);
      expect((error as Error).message).not.toContain(HOST_ID);
    }
  });

  it("does not fall back to the host app when stored ciphertext cannot be read", async () => {
    const { encrypt } = await import("./encryption");
    const { resolveXAppCredentialsFromRow, XAppCredentialsRequiredError } = await import(
      "./x-app-credentials"
    );
    const broken = {
      xClientId: encrypt("client-user-a-1111"),
      xClientSecret: "not-a-valid-payload",
    };

    expect(() => resolveXAppCredentialsFromRow("anyone", broken)).toThrow(
      XAppCredentialsRequiredError,
    );
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");
    expect(() => resolveXAppCredentialsFromRow("owner-1", broken)).toThrow(
      XAppCredentialsRequiredError,
    );
    expect(() =>
      resolveXAppCredentialsFromRow("owner-1", {
        xClientId: encrypt("only-one-side"),
        xClientSecret: null,
      }),
    ).toThrow(XAppCredentialsRequiredError);
  });

  it("rejects credential input without echoing the secret", async () => {
    const { parseXAppCredentialInput, xAppCredentialLast4 } = await import(
      "./x-app-credentials"
    );
    const secret = "bad secret supersecretmarker";
    const parsed = parseXAppCredentialInput({
      clientId: "  client-id-ok  ",
      clientSecret: "  secret-ok-value  ",
    });
    expect(parsed).toEqual({
      ok: true,
      clientId: "client-id-ok",
      clientSecret: "secret-ok-value",
    });

    const rejected = parseXAppCredentialInput({
      clientId: "client-id-ok",
      clientSecret: secret,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).not.toContain(secret);
      expect(rejected.error).toMatch(/cannot contain spaces/i);
    }
    expect(
      parseXAppCredentialInput({ clientId: 1, clientSecret: secret }),
    ).toEqual({ ok: false, error: "Client ID and client secret are required." });
    expect(xAppCredentialLast4("abcd")).toBe("••••");
    expect(xAppCredentialLast4("abcde")).toBe("bcde");
  });

  it("resolves OAuth from the signed-in user's pair and ignores a pending cookie", async () => {
    const { encrypt } = await import("./encryption");
    const { sealXAppPending, X_APP_PENDING_COOKIE } = await import("./x-app-pending");
    const rows = new Map<string, StoredRow>([
      [
        "user-a",
        {
          xClientId: encrypt("client-user-a-1111"),
          xClientSecret: encrypt("secret-user-a-zzzz"),
        },
      ],
      ["user-b", { xClientId: null, xClientSecret: null }],
    ]);
    findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      return rows.get(args.where.id) ?? null;
    });

    const {
      oauthClientForAuthConfig,
      resolveTwitterOAuthClient,
      UNCONFIGURED_X_OAUTH_CLIENT,
    } = await import("./x-app-credentials");

    const pending = `${X_APP_PENDING_COOKIE}=${sealXAppPending(
      "pending-client-id",
      "pending-client-secret",
    )}`;
    const signin = await sessionRequest("user-a", "/api/auth/signin/twitter", pending);
    await expect(resolveTwitterOAuthClient(signin)).resolves.toEqual({
      ok: true,
      credentials: {
        clientId: "client-user-a-1111",
        clientSecret: "secret-user-a-zzzz",
        source: "user",
      },
    });
    await expect(oauthClientForAuthConfig(signin)).resolves.toEqual({
      clientId: "client-user-a-1111",
      clientSecret: "secret-user-a-zzzz",
    });
    expect(findUnique.mock.calls.every((call) => call[0].where.id === "user-a")).toBe(true);

    const session = request("/api/auth/session");
    await expect(oauthClientForAuthConfig(session)).resolves.toEqual(
      UNCONFIGURED_X_OAUTH_CLIENT,
    );
    await expect(oauthClientForAuthConfig(undefined)).resolves.toEqual(
      UNCONFIGURED_X_OAUTH_CLIENT,
    );
    expect(UNCONFIGURED_X_OAUTH_CLIENT.clientSecret).not.toBe(HOST_SECRET);
  });

  it("fails closed for a public hosted account and does not attach the host secret", async () => {
    vi.stubEnv("VERCEL", "1");
    findUnique.mockResolvedValue({ xClientId: null, xClientSecret: null });
    const { oauthClientForAuthConfig, resolveTwitterOAuthClient, UNCONFIGURED_X_OAUTH_CLIENT } =
      await import("./x-app-credentials");

    const signin = await sessionRequest("public-user", "/api/auth/callback/twitter/");
    await expect(resolveTwitterOAuthClient(signin)).resolves.toEqual({
      ok: false,
      reason: "settings",
    });
    await expect(oauthClientForAuthConfig(signin)).resolves.toEqual(
      UNCONFIGURED_X_OAUTH_CLIENT,
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "public-user" },
      select: { xClientId: true, xClientSecret: true },
    });
  });

  it("uses a pending cookie only when nobody is signed in", async () => {
    const { sealXAppPending, X_APP_PENDING_COOKIE } = await import("./x-app-pending");
    const { resolveTwitterOAuthClient } = await import("./x-app-credentials");
    vi.stubEnv("VERCEL", "1");

    const pending = sealXAppPending("pending-client-id", "pending-client-secret");
    const anonymous = request(
      "/api/auth/signin/twitter",
      `${X_APP_PENDING_COOKIE}=${pending}`,
    );
    await expect(resolveTwitterOAuthClient(anonymous)).resolves.toEqual({
      ok: true,
      credentials: {
        clientId: "pending-client-id",
        clientSecret: "pending-client-secret",
        source: "pending",
      },
    });
    expect(findUnique).not.toHaveBeenCalled();

    const signedIn = await sessionRequest(
      "public-user",
      "/api/auth/signin/twitter",
      `${X_APP_PENDING_COOKIE}=${pending}`,
    );
    findUnique.mockResolvedValue({ xClientId: null, xClientSecret: null });
    await expect(resolveTwitterOAuthClient(signedIn)).resolves.toEqual({
      ok: false,
      reason: "settings",
    });
  });

  it("fails closed on OAuth when stored ciphertext cannot be read", async () => {
    const { encrypt } = await import("./encryption");
    findUnique.mockResolvedValue({
      xClientId: "not-ciphertext",
      xClientSecret: encrypt("secret-user-a-zzzz"),
    });
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");
    const { resolveTwitterOAuthClient } = await import("./x-app-credentials");

    await expect(
      resolveTwitterOAuthClient(
        await sessionRequest("owner-1", "/api/auth/signin/twitter"),
      ),
    ).resolves.toEqual({ ok: false, reason: "settings" });
  });

  it("uses the owner host app on OAuth only when that account has no stored pair", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");
    findUnique.mockResolvedValue({ xClientId: null, xClientSecret: null });
    const { resolveTwitterOAuthClient, resolveXAppCredentialsFromRow } = await import(
      "./x-app-credentials"
    );

    await expect(
      resolveTwitterOAuthClient(
        await sessionRequest("owner-1", "/api/auth/callback/twitter"),
      ),
    ).resolves.toEqual({
      ok: true,
      credentials: {
        clientId: HOST_ID,
        clientSecret: HOST_SECRET,
        source: "owner",
      },
    });

    vi.stubEnv("VERCEL", "");
    vi.stubEnv("OWNER_USER_ID", "");
    vi.stubEnv("AUTH_TWITTER_ID", "   ");
    expect(() =>
      resolveXAppCredentialsFromRow("anyone", {
        xClientId: null,
        xClientSecret: null,
      }),
    ).toThrow(/AUTH_TWITTER_ID is not configured/);
  });

  it("keeps bootstrap sign-in on the host app when no pending cookie is set", async () => {
    const { resolveTwitterOAuthClient } = await import("./x-app-credentials");
    await expect(
      resolveTwitterOAuthClient(request("/api/auth/signin/twitter")),
    ).resolves.toEqual({
      ok: true,
      credentials: {
        clientId: HOST_ID,
        clientSecret: HOST_SECRET,
        source: "bootstrap",
      },
    });

    vi.stubEnv("VERCEL", "1");
    await expect(
      resolveTwitterOAuthClient(request("/api/auth/signin/twitter")),
    ).resolves.toEqual({ ok: false, reason: "settings" });

    vi.stubEnv("AUTH_TWITTER_ID", "");
    vi.stubEnv("VERCEL", "");
    await expect(
      resolveTwitterOAuthClient(request("/api/auth/signin/twitter")),
    ).resolves.toEqual({ ok: false, reason: "configuration" });
  });
});
