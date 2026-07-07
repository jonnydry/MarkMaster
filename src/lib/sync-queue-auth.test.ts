import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/sync-run-executor", () => ({
  executeSyncRun: vi.fn(),
}));

vi.mock("@/lib/sync-throttle", () => ({
  getSyncRetryUntil: vi.fn(),
}));

import { isSyncWorkerAuthorized } from "@/lib/sync-queue";

describe("isSyncWorkerAuthorized", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SYNC_WORKER_SECRET;
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows production requests with matching SYNC_WORKER_SECRET", () => {
    process.env.NODE_ENV = "production";
    process.env.SYNC_WORKER_SECRET = "sync-secret";

    const request = new Request("http://localhost/api/internal/sync/worker", {
      headers: { Authorization: "Bearer sync-secret" },
    });

    expect(isSyncWorkerAuthorized(request)).toBe(true);
  });

  it("allows production requests with matching CRON_SECRET when SYNC_WORKER_SECRET is unset", () => {
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "cron-secret";

    const request = new Request("http://localhost/api/internal/sync/worker", {
      headers: { Authorization: "Bearer cron-secret" },
    });

    expect(isSyncWorkerAuthorized(request)).toBe(true);
  });

  it("accepts either secret when both are configured", () => {
    process.env.NODE_ENV = "production";
    process.env.SYNC_WORKER_SECRET = "sync-secret";
    process.env.CRON_SECRET = "cron-secret";

    const syncRequest = new Request("http://localhost/api/internal/sync/worker", {
      headers: { Authorization: "Bearer sync-secret" },
    });
    const cronRequest = new Request("http://localhost/api/internal/sync/worker", {
      headers: { Authorization: "Bearer cron-secret" },
    });

    expect(isSyncWorkerAuthorized(syncRequest)).toBe(true);
    expect(isSyncWorkerAuthorized(cronRequest)).toBe(true);
  });

  it("rejects wrong bearer in production", () => {
    process.env.NODE_ENV = "production";
    process.env.SYNC_WORKER_SECRET = "sync-secret";

    const request = new Request("http://localhost/api/internal/sync/worker", {
      headers: { Authorization: "Bearer wrong" },
    });

    expect(isSyncWorkerAuthorized(request)).toBe(false);
  });

  it("rejects production requests when no secrets are configured", () => {
    process.env.NODE_ENV = "production";

    const request = new Request("http://localhost/api/internal/sync/worker", {
      headers: { Authorization: "Bearer anything" },
    });

    expect(isSyncWorkerAuthorized(request)).toBe(false);
  });

  it("allows requests in development when no secrets are configured", () => {
    process.env.NODE_ENV = "development";

    const request = new Request("http://localhost/api/internal/sync/worker");

    expect(isSyncWorkerAuthorized(request)).toBe(true);
  });
});
