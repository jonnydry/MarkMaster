import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBalancedTagColor } from "@/lib/tag-colors";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    bookmark: {
      findMany: vi.fn(),
    },
    bookmarkTag: {
      createMany: vi.fn(),
    },
  },
}));

describe("/api/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns a balanced color when creating a tag without an explicit color", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");
    const existingTags = [
      { name: "AI", color: "#1d9bf0" },
      { name: "Research", color: "#1d9bf0" },
      { name: "Tools", color: "#06b6d4" },
    ];
    const expectedColor = getBalancedTagColor("Recipes", existingTags);

    vi.mocked(prisma.tag.findMany).mockResolvedValue(existingTags);
    vi.mocked(prisma.tag.upsert).mockResolvedValue({
      id: "tag-recipes",
      userId: "user-1",
      name: "Recipes",
      color: expectedColor,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/tags", {
        method: "POST",
        body: JSON.stringify({ name: "Recipes" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: "user-1",
          name: "Recipes",
          color: expectedColor,
        },
      })
    );
  });
});
