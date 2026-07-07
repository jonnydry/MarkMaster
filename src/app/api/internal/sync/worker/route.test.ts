import { beforeEach, describe, expect, it, vi } from "vitest";

const processSyncRunMock = vi.hoisted(() => vi.fn());
const processPendingSyncRunsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sync-queue", () => ({
  isSyncWorkerAuthorized: vi.fn((request: Request) =>
    request.headers.get("authorization") === "Bearer test-secret"
  ),
  processSyncRun: processSyncRunMock,
  processPendingSyncRuns: processPendingSyncRunsMock,
}));

describe("/api/internal/sync/worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processSyncRunMock.mockResolvedValue({ processed: true, runId: "run-1" });
    processPendingSyncRunsMock.mockResolvedValue([{ processed: true, runId: "run-2" }]);
  });

  it("rejects unauthenticated POST worker requests", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/internal/sync/worker", {
        method: "POST",
        body: JSON.stringify({ runId: "run-1" }),
      })
    );

    expect(response.status).toBe(401);
    expect(processSyncRunMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated GET cron requests", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/internal/sync/worker", {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
    expect(processPendingSyncRunsMock).not.toHaveBeenCalled();
  });

  it("processes a specific queued run via POST", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/internal/sync/worker", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ runId: "run-1" }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: true, runId: "run-1" });
    expect(processSyncRunMock).toHaveBeenCalledWith("run-1");
  });

  it("drains pending runs via GET (Vercel Cron) without a body", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/internal/sync/worker", {
        method: "GET",
        headers: { Authorization: "Bearer test-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      drained: 1,
      results: [{ processed: true, runId: "run-2" }],
    });
    expect(processPendingSyncRunsMock).toHaveBeenCalledWith(3);
    expect(processSyncRunMock).not.toHaveBeenCalled();
  });

  it("drains pending runs via POST when no runId is provided", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/internal/sync/worker", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
        body: "{}",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      drained: 1,
      results: [{ processed: true, runId: "run-2" }],
    });
    expect(processPendingSyncRunsMock).toHaveBeenCalledWith(3);
  });
});
