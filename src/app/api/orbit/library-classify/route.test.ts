import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbUserMock = vi.hoisted(() => vi.fn(async () => ({ id: "user-1" })));
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const lib = vi.hoisted(() => ({
  cancelOrbitLibraryRun: vi.fn(),
  countOrbitLibraryQueue: vi.fn(),
  createOrbitLibraryRun: vi.fn(),
  driveOrbitLibraryRun: vi.fn(),
  getLatestOrbitLibraryRun: vi.fn(),
  isOrbitLibraryRunResumable: vi.fn(() => false),
  isOrbitLibraryRunStale: vi.fn(() => false),
  resumeOrbitLibraryRun: vi.fn(),
  toOrbitLibraryRunView: vi.fn((run: { id: string; status: string }) => ({
    id: run.id,
    status: run.status.toLowerCase(),
  })),
}));
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock("@/lib/auth", () => ({
  getDbUser: getDbUserMock,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: checkRateLimitMock,
  };
});

vi.mock("@/lib/orbit-library-classify", () => lib);

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCallbacks.push(fn);
    },
  };
});

const running = { id: "run-1", status: "RUNNING" };

describe("/api/orbit/library-classify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    lib.isOrbitLibraryRunStale.mockReturnValue(false);
    lib.isOrbitLibraryRunResumable.mockReturnValue(false);
    checkRateLimitMock.mockResolvedValue({
      success: true,
      limit: 24,
      remaining: 23,
      reset: Date.now() + 1000,
    });
  });

  it("returns unauthorized without a session", async () => {
    getDbUserMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("reports the untagged count when no run is active", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(null);
    lib.countOrbitLibraryQueue.mockResolvedValueOnce(1234);
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:progress", "user-1");
    await expect(response.json()).resolves.toEqual({
      untaggedCount: 1234,
      run: null,
    });
  });

  it("skips the count query while polling an active run", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(running);
    const { GET } = await import("./route");
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      untaggedCount: null,
      run: { id: "run-1", status: "running" },
    });
    expect(lib.countOrbitLibraryQueue).not.toHaveBeenCalled();
  });

  it("returns a live run instead of starting a second one", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(running);
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(lib.createOrbitLibraryRun).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("starts a run, responds at once, and drives it after the response", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(null);
    lib.createOrbitLibraryRun.mockResolvedValueOnce(running);
    const { POST } = await import("./route");
    const response = await POST();

    expect(response.status).toBe(201);
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:library", "user-1");
    await expect(response.json()).resolves.toEqual({
      untaggedCount: null,
      run: { id: "run-1", status: "running" },
    });
    expect(lib.driveOrbitLibraryRun).not.toHaveBeenCalled();
    await afterCallbacks[0]!();
    expect(lib.driveOrbitLibraryRun).toHaveBeenCalledWith("run-1");
  });

  it("resumes a run whose worker stopped", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(running);
    lib.isOrbitLibraryRunStale.mockReturnValueOnce(true);
    lib.isOrbitLibraryRunResumable.mockReturnValueOnce(true);
    lib.resumeOrbitLibraryRun.mockResolvedValueOnce(running);
    const { POST } = await import("./route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(lib.resumeOrbitLibraryRun).toHaveBeenCalledWith("run-1");
    expect(lib.createOrbitLibraryRun).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
  });

  it("resumes a recently failed run instead of starting over", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce({ id: "run-0", status: "FAILED" });
    lib.isOrbitLibraryRunResumable.mockReturnValueOnce(true);
    lib.resumeOrbitLibraryRun.mockResolvedValueOnce({ id: "run-0", status: "RUNNING" });
    const { POST } = await import("./route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:library", "user-1");
    expect(lib.resumeOrbitLibraryRun).toHaveBeenCalledWith("run-0");
    expect(lib.createOrbitLibraryRun).not.toHaveBeenCalled();
    await afterCallbacks[0]!();
    expect(lib.driveOrbitLibraryRun).toHaveBeenCalledWith("run-0");
  });

  it("starts fresh after a finished run", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce({ id: "run-0", status: "COMPLETED" });
    lib.createOrbitLibraryRun.mockResolvedValueOnce(running);
    const { POST } = await import("./route");
    const response = await POST();

    expect(response.status).toBe(201);
    expect(lib.resumeOrbitLibraryRun).not.toHaveBeenCalled();
  });

  it("says so when there is nothing to tag", async () => {
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(null);
    lib.createOrbitLibraryRun.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST();
    await expect(response.json()).resolves.toEqual({
      untaggedCount: 0,
      run: null,
    });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("surfaces TypeSafe configuration failures", async () => {
    const { OrbitGrokError } = await import("@/lib/orbit-grok");
    lib.getLatestOrbitLibraryRun.mockResolvedValueOnce(null);
    lib.createOrbitLibraryRun.mockRejectedValueOnce(
      new OrbitGrokError(
        "Set TYPESAFE_API_KEY before tagging the library.",
        503,
        "typesafe_auth"
      )
    );
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "typesafe_auth",
    });
  });

  it("stops the active run", async () => {
    lib.cancelOrbitLibraryRun.mockResolvedValueOnce({
      id: "run-1",
      status: "CANCELLED",
    });
    const { DELETE } = await import("./route");
    const response = await DELETE();
    expect(lib.cancelOrbitLibraryRun).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      untaggedCount: null,
      run: { id: "run-1", status: "cancelled" },
    });
  });
});
