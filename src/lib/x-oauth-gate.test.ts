import { encode } from "@auth/core/jwt";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const AUTH_SECRET = "test-auth-secret-not-real";
const HOST_SECRET = "host-client-secret-should-not-leak";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("./prisma", () => ({
  prisma: { user: { findUnique } },
}));

async function sessionRequest(userId: string, path: string, redirect = false) {
  const { getSessionCookieName } = await import("./auth-edge");
  const name = getSessionCookieName();
  const token = await encode({
    token: { sub: "authjs-subject", dbUser: { id: userId } },
    secret: AUTH_SECRET,
    salt: name,
  });
  const headers = new Headers({ cookie: `${name}=${token}` });
  if (redirect) headers.set("x-auth-return-redirect", "1");
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("blockTwitterOAuthIfUnconfigured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
    vi.stubEnv("AUTH_TWITTER_ID", "host-client-id");
    vi.stubEnv("AUTH_TWITTER_SECRET", HOST_SECRET);
    findUnique.mockResolvedValue({ xClientId: null, xClientSecret: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves non-oauth auth requests alone", async () => {
    const { blockTwitterOAuthIfUnconfigured } = await import("./x-oauth-gate");
    const response = await blockTwitterOAuthIfUnconfigured(
      new NextRequest("http://localhost:3000/api/auth/session"),
    );
    expect(response).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("sends a signed-in public user to Settings without the host secret", async () => {
    vi.stubEnv("VERCEL", "1");
    const { blockTwitterOAuthIfUnconfigured } = await import("./x-oauth-gate");
    const response = await blockTwitterOAuthIfUnconfigured(
      await sessionRequest("public-user", "/api/auth/signin/twitter", true),
    );

    expect(response).not.toBeNull();
    const body = await response!.json();
    expect(body.url).toBe("http://localhost:3000/settings?xApp=required#sync");
    expect(JSON.stringify(body)).not.toContain(HOST_SECRET);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "public-user" },
      select: { xClientId: true, xClientSecret: true },
    });
  });

  it("redirects an anonymous hosted sign-in to the login prompt", async () => {
    vi.stubEnv("VERCEL", "1");
    const { blockTwitterOAuthIfUnconfigured } = await import("./x-oauth-gate");
    const response = await blockTwitterOAuthIfUnconfigured(
      new NextRequest("http://localhost:3000/api/auth/callback/twitter"),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "http://localhost:3000/login?error=XAppRequired",
    );
    expect(response?.headers.get("location")).not.toContain(HOST_SECRET);
  });

  it("allows OAuth when the signed-in user has a stored app", async () => {
    vi.stubEnv("VERCEL", "1");
    const { encrypt } = await import("./encryption");
    findUnique.mockResolvedValue({
      xClientId: encrypt("client-user-a-1111"),
      xClientSecret: encrypt("secret-user-a-zzzz"),
    });
    const { blockTwitterOAuthIfUnconfigured } = await import("./x-oauth-gate");

    await expect(
      blockTwitterOAuthIfUnconfigured(
        await sessionRequest("user-a", "/api/auth/signin/twitter"),
      ),
    ).resolves.toBeNull();
  });

  it("redirects to the configuration error when bootstrap has no host app", async () => {
    vi.stubEnv("AUTH_TWITTER_ID", "");
    const { blockTwitterOAuthIfUnconfigured } = await import("./x-oauth-gate");
    const response = await blockTwitterOAuthIfUnconfigured(
      new NextRequest("http://localhost:3000/api/auth/signin/twitter"),
    );
    expect(response?.headers.get("location")).toBe(
      "http://localhost:3000/login?error=Configuration",
    );
  });
});
