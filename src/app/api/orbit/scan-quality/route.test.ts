import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    flywheelEvent: {
      findMany: vi.fn(),
    },
  },
}));

describe("/api/orbit/scan-quality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe defaults when there is no scan telemetry", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    vi.mocked(prisma.flywheelEvent.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recommendedProfile).toBe("quick");
    expect(body.deep.unlocked).toBe(false);
  });

  it("aggregates scan and review telemetry into a quality payload", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    vi.mocked(prisma.flywheelEvent.findMany)
      .mockResolvedValueOnce([
        {
          eventType: "orbit.scan.completed",
          payload: {
            requestedCount: 24,
            durationMs: 30_000,
            usefulSuggestions: 18,
            modelAbstains: 4,
          },
        },
        {
          eventType: "orbit.scan.completed",
          payload: {
            requestedCount: 24,
            durationMs: 35_000,
            usefulSuggestions: 18,
            modelAbstains: 4,
          },
        },
        {
          eventType: "orbit.scan.completed",
          payload: {
            requestedCount: 12,
            durationMs: 20_000,
            usefulSuggestions: 9,
            modelAbstains: 2,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          payload: {
            accepted: 4,
            edited: 2,
            kept: 1,
            rejected: 1,
          },
        },
      ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recommendedProfile).toBe("balanced");
    expect(body.reviewedSuggestionCount).toBe(8);
    expect(body.reviewUsefulRate).toBe(0.75);
  });
});
