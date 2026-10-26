import { beforeEach, describe, expect, it, vi } from "vitest";

const kickSyncWorkerMock = vi.hoisted(() => vi.fn());
const enqueueSyncRunMock = vi.hoisted(() => vi.fn());
const peekSyncRunGateMock = vi.hoisted(() => vi.fn());
const resolveXAppCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1", syncXFolders: false })),
}));

vi.mock("@/lib/x-app-credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/x-app-credentials")>();
  return {
    ...actual,
    resolveXAppCredentials: resolveXAppCredentialsMock,
  };
});

vi.mock("@/lib/sync-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync-queue")>();
  return {
    ...actual,
    enqueueSyncRun: enqueueSyncRunMock,
    kickSyncWorker: kickSyncWorkerMock,
    peekSyncRunGate: peekSyncRunGateMock,
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: true })),
  checkGlobalRateLimit: vi.fn(async () => ({ success: true })),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      void callback();
    },
  };
});

describe("/api/bookmarks/sync POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    peekSyncRunGateMock.mockResolvedValue(null);
    enqueueSyncRunMock.mockResolvedValue({ created: { id: "run-1" } });
    kickSyncWorkerMock.mockResolvedValue(undefined);
    resolveXAppCredentialsMock.mockResolvedValue({
      clientId: "bootstrap-client",
      clientSecret: "bootstrap-secret",
      source: "bootstrap",
    });
  });

  it("rejects with 409 before consuming a rate-limit token when a sync is active", async () => {
    const activeRun = { id: "run-0", status: "RUNNING" };
    peekSyncRunGateMock.mockResolvedValue({ conflict: activeRun });
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.currentRun).toEqual(activeRun);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(enqueueSyncRunMock).not.toHaveBeenCalled();
  });

  it("accepts sync with 202 and dispatches the background worker", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
    }));
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toEqual({
      runId: "run-1",
      status: "PENDING",
      accepted: true,
    });
    expect(enqueueSyncRunMock).toHaveBeenCalledWith("user-1", {
      includeFolders: false,
    });
    expect(kickSyncWorkerMock).toHaveBeenCalledWith("run-1");
  });

  it("uses a valid JSON body to override the saved folder preference", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeFolders: true }),
    }));

    expect(response.status).toBe(202);
    expect(enqueueSyncRunMock).toHaveBeenCalledWith("user-1", {
      includeFolders: true,
    });
  });

  it("returns 400 for malformed JSON instead of silently using saved preferences", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ nope",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Invalid JSON body" });
    expect(enqueueSyncRunMock).not.toHaveBeenCalled();
    expect(kickSyncWorkerMock).not.toHaveBeenCalled();
  });

  it("returns 413 for JSON sync bodies above the route limit", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(256 * 1024 + 1),
      },
      body: JSON.stringify({ includeFolders: true }),
    }));
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json).toEqual({ error: "Request body is too large" });
    expect(enqueueSyncRunMock).not.toHaveBeenCalled();
    expect(kickSyncWorkerMock).not.toHaveBeenCalled();
  });

  it("resolves credentials for the signed-in user and ignores a user id in the body", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeFolders: false, userId: "user-other" }),
    }));

    expect(response.status).toBe(202);
    expect(resolveXAppCredentialsMock).toHaveBeenCalledTimes(1);
    expect(resolveXAppCredentialsMock).toHaveBeenCalledWith("user-1");
    expect(enqueueSyncRunMock).toHaveBeenCalledWith("user-1", {
      includeFolders: false,
    });
  });

  it("fails closed before enqueue when the account has no X app", async () => {
    const { XAppCredentialsRequiredError } = await import("@/lib/x-app-credentials");
    const { checkRateLimit } = await import("@/lib/rate-limit");
    resolveXAppCredentialsMock.mockRejectedValueOnce(new XAppCredentialsRequiredError());
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/bookmarks/sync", {
      method: "POST",
    }));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.code).toBe("X_APP_CREDENTIALS_REQUIRED");
    expect(json.settingsPath).toBe("/settings?xApp=required#sync");
    expect(json.error).toMatch(/Settings/);
    expect(json.error).not.toMatch(/AUTH_TWITTER/);
    expect(enqueueSyncRunMock).not.toHaveBeenCalled();
    expect(kickSyncWorkerMock).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
