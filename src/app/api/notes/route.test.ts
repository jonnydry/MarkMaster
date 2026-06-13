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
    bookmark: {
      findUnique: vi.fn(),
    },
    note: {
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("/api/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates or updates a note on an owned bookmark", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { invalidateUserResponseCache } = await import("@/lib/upstash-cache");
    const { POST } = await import("./route");

    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({ id: "bookmark-1" });
    vi.mocked(prisma.note.upsert).mockResolvedValue({
      id: "note-1",
      bookmarkId: "bookmark-1",
      userId: "user-1",
      content: "Important thread",
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookmarkId: "bookmark-1",
          content: "Important thread",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.note.upsert).toHaveBeenCalledWith({
      where: {
        bookmarkId_userId: { bookmarkId: "bookmark-1", userId: "user-1" },
      },
      update: { content: "Important thread" },
      create: {
        bookmarkId: "bookmark-1",
        userId: "user-1",
        content: "Important thread",
      },
    });
    expect(invalidateUserResponseCache).toHaveBeenCalledWith("user-1");
  });

  it("returns 404 when the bookmark does not belong to the user", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookmarkId: "bookmark-missing",
          content: "Nope",
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(prisma.note.upsert).not.toHaveBeenCalled();
  });

  it("deletes an owned note", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { DELETE } = await import("./route");

    vi.mocked(prisma.note.delete).mockResolvedValue({
      id: "note-1",
    } as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: "note-1" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.note.delete).toHaveBeenCalledWith({
      where: { id: "note-1", userId: "user-1" },
    });
  });
});
