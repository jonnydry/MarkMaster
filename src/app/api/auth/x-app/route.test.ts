import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function post(body: unknown, origin?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request("http://localhost:3000/api/auth/x-app", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/x-app", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets an encrypted auth-scoped cookie and does not echo the secret", async () => {
    const { POST } = await import("./route");
    const { openXAppPending, X_APP_PENDING_COOKIE } = await import("@/lib/x-app-pending");
    const clientId = "pending-client-id";
    const clientSecret = "pending-client-secret";

    const response = await POST(
      post({ clientId, clientSecret }, "http://localhost:3000"),
    );
    const text = await response.clone().text();
    const sealed = response.cookies.get(X_APP_PENDING_COOKIE);

    expect(response.status).toBe(200);
    expect(text).toBe('{"ok":true}');
    expect(text).not.toContain(clientSecret);
    expect(sealed?.value).toBeTruthy();
    expect(sealed?.value).not.toContain(clientSecret);
    expect(sealed).toMatchObject({
      httpOnly: true,
      path: "/api/auth",
      sameSite: "lax",
    });
    expect(openXAppPending(sealed?.value)).toEqual({ clientId, clientSecret });
  });

  it("rejects a missing or foreign origin before storing anything", async () => {
    const { POST } = await import("./route");
    const missing = await POST(post({ clientId: "pending-client-id", clientSecret: "pending-client-secret" }));
    const foreign = await POST(
      post(
        { clientId: "pending-client-id", clientSecret: "pending-client-secret" },
        "https://evil.example",
      ),
    );

    expect(missing.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(missing.headers.get("set-cookie")).toBeNull();
    expect(foreign.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an invalid secret without repeating it", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      post(
        { clientId: "pending-client-id", clientSecret: "bad supersecretmarker" },
        "http://localhost:3000",
      ),
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toContain("supersecretmarker");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
