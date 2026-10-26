import { encode } from "@auth/core/jwt";
import { setEnvDefaults } from "@auth/core";
import { NextRequest } from "next/server";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NextAuth's HTTP handler imports `next/server` in a way this runner cannot
 * load. The client that actually reaches X is the provider after
 * `setEnvDefaults` (which fills AUTH_TWITTER_* when clientId is missing) and
 * `parseProviders` (which lets the explicit Twitter() options win). Drive
 * that merge with the real per-request config.
 */
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const AUTH_SECRET = "test-auth-secret-not-real";
const HOST_ID = "host-client-id-should-not-leak";
const HOST_SECRET = "host-client-secret-should-not-leak";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("./prisma", () => ({
  prisma: { user: { findUnique } },
}));

async function parseTwitter(config: {
  providers: unknown[];
  basePath?: string;
}) {
  const href = pathToFileURL(
    `${process.cwd()}/node_modules/@auth/core/lib/utils/providers.js`,
  ).href;
  const { default: parseProviders } = await import(href);
  setEnvDefaults(process.env, config, true);
  const { provider } = parseProviders({
    providerId: "twitter",
    config,
    url: new URL("http://localhost:3000/api/auth/signin/twitter"),
  });
  return provider as {
    clientId?: string;
    clientSecret?: string;
    authorization?: { url: URL };
  };
}

async function sessionRequest(userId: string, path: string) {
  const { getSessionCookieName } = await import("./auth-edge");
  const name = getSessionCookieName();
  const token = await encode({
    token: { sub: "authjs-subject", dbUser: { id: userId } },
    secret: AUTH_SECRET,
    salt: name,
  });
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie: `${name}=${token}` },
  });
}

describe("Auth.js Twitter client selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
    vi.stubEnv("AUTH_TWITTER_ID", HOST_ID);
    vi.stubEnv("AUTH_TWITTER_SECRET", HOST_SECRET);
    findUnique.mockResolvedValue({ xClientId: null, xClientSecret: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the signed-in user's client after Auth.js applies AUTH_TWITTER_* defaults", async () => {
    const { encrypt } = await import("./encryption");
    findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id !== "user-a") {
        throw new Error(`refused lookup for ${args.where.id}`);
      }
      return {
        xClientId: encrypt("client-user-a-1111"),
        xClientSecret: encrypt("secret-user-a-zzzz"),
      };
    });

    const { authConfigForRequest } = await import("./auth");
    const config = await authConfigForRequest(
      await sessionRequest("user-a", "/api/auth/signin/twitter"),
    );
    const provider = await parseTwitter(config);

    expect(provider.clientId).toBe("client-user-a-1111");
    expect(provider.clientSecret).toBe("secret-user-a-zzzz");
    expect(provider.clientId).not.toBe(HOST_ID);
    expect(provider.clientSecret).not.toBe(HOST_SECRET);
    expect(provider.authorization?.url.searchParams.get("scope")).toContain("bookmark.read");
  });

  it("does not let the host client replace the fail-closed placeholder", async () => {
    vi.stubEnv("VERCEL", "1");
    const { authConfigForRequest } = await import("./auth");
    const config = await authConfigForRequest(
      await sessionRequest("public-user", "/api/auth/signin/twitter"),
    );
    const provider = await parseTwitter(config);

    expect(provider.clientId).toBe("markmaster-x-app-unconfigured");
    expect(provider.clientSecret).toBe("markmaster-x-app-unconfigured");
    expect(provider.clientSecret).not.toBe(HOST_SECRET);
  });

  it("uses a pending cookie for anonymous hosted authorize", async () => {
    vi.stubEnv("VERCEL", "1");
    const { sealXAppPending, X_APP_PENDING_COOKIE } = await import("./x-app-pending");
    const { authConfigForRequest } = await import("./auth");
    const sealed = sealXAppPending("pending-client-id", "pending-client-secret");
    const config = await authConfigForRequest(
      new NextRequest("http://localhost:3000/api/auth/callback/twitter", {
        headers: { cookie: `${X_APP_PENDING_COOKIE}=${sealed}` },
      }),
    );
    const provider = await parseTwitter(config);

    expect(provider.clientId).toBe("pending-client-id");
    expect(provider.clientSecret).toBe("pending-client-secret");
    expect(provider.clientSecret).not.toBe(HOST_SECRET);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("uses the host app for anonymous bootstrap authorize", async () => {
    const { authConfigForRequest } = await import("./auth");
    const config = await authConfigForRequest(
      new NextRequest("http://localhost:3000/api/auth/signin/twitter"),
    );
    const provider = await parseTwitter(config);

    expect(provider.clientId).toBe(HOST_ID);
    expect(provider.clientSecret).toBe(HOST_SECRET);
  });

  it("does not attach the host secret to session reads", async () => {
    const { authConfigForRequest } = await import("./auth");
    const config = await authConfigForRequest(
      new NextRequest("http://localhost:3000/api/auth/session"),
    );
    const provider = await parseTwitter(config);

    expect(provider.clientId).toBe("markmaster-x-app-unconfigured");
    expect(provider.clientSecret).not.toBe(HOST_SECRET);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
