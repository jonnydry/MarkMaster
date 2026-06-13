import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collection: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("/api/collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists collections for the authenticated user", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      { id: "collection-1", name: "Reading list", _count: { items: 3 } },
    ] as never);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(prisma.collection.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("creates a user collection and invalidates cache", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { invalidateUserResponseCache } = await import("@/lib/upstash-cache");
    const { POST } = await import("./route");

    vi.mocked(prisma.collection.create).mockResolvedValue({
      id: "collection-new",
      name: "Research",
      type: "user_collection",
      isPublic: false,
      shareSlug: null,
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Research", description: "Papers" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.collection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        name: "Research",
        description: "Papers",
        type: "user_collection",
        isPublic: false,
        shareSlug: null,
      }),
    });
    expect(invalidateUserResponseCache).toHaveBeenCalledWith("user-1");
  });

  it("assigns a share slug when creating a public collection", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    vi.mocked(prisma.collection.create).mockResolvedValue({
      id: "collection-public",
      shareSlug: "abc123",
    } as never);

    await POST(
      new NextRequest("http://localhost/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Public list", isPublic: true }),
      })
    );

    expect(prisma.collection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isPublic: true,
        shareSlug: expect.any(String),
      }),
    });
  });
});
