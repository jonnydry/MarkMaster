import { encode } from "@auth/core/jwt";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { undecryptableSessionCookieNames } from "./auth-edge";

const SECRET = "test-auth-secret-not-real";
const OTHER_SECRET = "different-auth-secret-not-real";
const COOKIE = "authjs.session-token";

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest("http://localhost:3000/", {
    headers: { cookie },
  });
}

describe("undecryptableSessionCookieNames", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns nothing when the request has no session cookie", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    await expect(
      undecryptableSessionCookieNames(requestWithCookie("theme=dark"))
    ).resolves.toEqual([]);
  });

  it("returns nothing when AUTH_SECRET is missing", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(
      undecryptableSessionCookieNames(requestWithCookie(`${COOKIE}=not-a-jwt`))
    ).resolves.toEqual([]);
  });

  it("keeps a session cookie this server can decrypt", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const token = await encode({
      token: { sub: "user-1", name: "Ada" },
      secret: SECRET,
      salt: COOKIE,
    });

    await expect(
      undecryptableSessionCookieNames(
        requestWithCookie(`${COOKIE}=${token}; theme=dark`)
      )
    ).resolves.toEqual([]);
  });

  it("names a session cookie encrypted with a different secret", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const token = await encode({
      token: { sub: "user-1" },
      secret: OTHER_SECRET,
      salt: COOKIE,
    });

    await expect(
      undecryptableSessionCookieNames(requestWithCookie(`${COOKIE}=${token}`))
    ).resolves.toEqual([COOKIE]);
  });

  it("names a malformed session cookie", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    await expect(
      undecryptableSessionCookieNames(requestWithCookie(`${COOKIE}=not-a-jwt`))
    ).resolves.toEqual([COOKIE]);
  });

  it("joins chunked cookies before deciding", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const token = await encode({
      token: { sub: "user-1" },
      secret: SECRET,
      salt: COOKIE,
    });
    const mid = Math.ceil(token.length / 2);

    await expect(
      undecryptableSessionCookieNames(
        requestWithCookie(
          `${COOKIE}.0=${token.slice(0, mid)}; ${COOKIE}.1=${token.slice(mid)}`
        )
      )
    ).resolves.toEqual([]);
  });
});
