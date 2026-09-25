import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthorizedMock = vi.hoisted(() => vi.fn(() => true));
const driveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sync-queue", () => ({
  isSyncWorkerAuthorized: isAuthorizedMock,
}));

vi.mock("@/lib/orbit-library-classify", () => ({
  driveOrbitLibraryRun: driveMock,
}));

function workerRequest(body: unknown) {
  return new NextRequest("http://localhost/api/internal/orbit/library-classify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/internal/orbit/library-classify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthorizedMock.mockReturnValue(true);
  });

  it("rejects unauthorized worker calls", async () => {
    isAuthorizedMock.mockReturnValueOnce(false);
    const { POST } = await import("./route");
    const response = await POST(workerRequest({ runId: "run-1" }));
    expect(response.status).toBe(401);
    expect(driveMock).not.toHaveBeenCalled();
  });

  it("rejects a body without a run id", async () => {
    const { POST } = await import("./route");
    const response = await POST(workerRequest({ userId: "user-1" }));
    expect(response.status).toBe(400);
  });

  it("continues the given run", async () => {
    const { POST } = await import("./route");
    const response = await POST(workerRequest({ runId: "run-1" }));
    expect(response.status).toBe(200);
    expect(driveMock).toHaveBeenCalledWith("run-1");
  });
});
