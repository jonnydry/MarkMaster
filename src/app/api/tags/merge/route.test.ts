import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ success: true })),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => undefined),
}));

vi.mock("@/lib/tag-merge", () => ({
  TagMergeError: class TagMergeError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  mergeUserTags: vi.fn(),
}));

describe("POST /api/tags/merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges a source tag into a target tag", async () => {
    const { mergeUserTags } = await import("@/lib/tag-merge");
    vi.mocked(mergeUserTags).mockResolvedValue({
      sourceName: "MEMES",
      targetName: "Memes",
      movedBookmarkCount: 2,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/tags/merge", {
        method: "POST",
        body: JSON.stringify({
          sourceTagId: "src",
          targetTagId: "dst",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mergeUserTags).toHaveBeenCalledWith({
      userId: "user-1",
      sourceTagId: "src",
      targetTagId: "dst",
    });
    await expect(response.json()).resolves.toMatchObject({
      sourceName: "MEMES",
      targetName: "Memes",
    });
  });
});
