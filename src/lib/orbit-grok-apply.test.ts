import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookmark: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    collection: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  applyOrbitScanPlan,
  OrbitGrokError,
  orbitScanPlanSchema,
} from "@/lib/orbit-grok";

describe("applyOrbitScanPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new tag and records bookmark tag assignments", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([{ id: "b1" }]);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);

    const mockTx = {
      tag: {
        create: vi
          .fn()
          .mockResolvedValue({ id: "t-new", name: "Alpha", color: "#22c55e" }),
      },
      bookmarkTag: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      collection: { create: vi.fn() },
      collectionItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(mockTx as never)
    );

    const plan = orbitScanPlanSchema.parse({
      overview: {
        summary: "s",
        taggingStrategy: "t",
        collectionStrategy: "c",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "r",
          tags: [
            {
              name: "Alpha",
              color: "#22c55e",
              reason: "topic",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
      ],
    });

    const result = await applyOrbitScanPlan({
      userId: "u1",
      plan,
      createCollections: true,
    });

    expect(result.createdTags).toBe(1);
    expect(result.tagAssignments).toBe(1);
    expect(mockTx.tag.create).toHaveBeenCalledTimes(1);
    expect(mockTx.bookmarkTag.createMany).toHaveBeenCalled();
  });

  it("throws when bookmarks in the plan no longer exist", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const plan = orbitScanPlanSchema.parse({
      overview: {
        summary: "s",
        taggingStrategy: "t",
        collectionStrategy: "c",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "r",
          tags: [],
          collection: null,
        },
      ],
    });

    await expect(
      applyOrbitScanPlan({ userId: "u1", plan, createCollections: true })
    ).rejects.toMatchObject({
      name: "OrbitGrokError",
      status: 404,
    } satisfies Partial<OrbitGrokError>);
  });

  it("skips creating a collection when only one bookmark maps to a new bucket", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([{ id: "b1" }]);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);

    const mockTx = {
      tag: { create: vi.fn() },
      bookmarkTag: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      collection: { create: vi.fn() },
      collectionItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        createMany: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(mockTx as never)
    );

    const plan = orbitScanPlanSchema.parse({
      overview: {
        summary: "s",
        taggingStrategy: "t",
        collectionStrategy: "c",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "r",
          tags: [],
          collection: {
            name: "SoloTheme",
            description: "Only one bookmark here",
            reason: "group",
            reuseExisting: false,
          },
        },
      ],
    });

    const result = await applyOrbitScanPlan({
      userId: "u1",
      plan,
      createCollections: true,
    });

    expect(result.skippedNewCollectionSingletons).toBe(1);
    expect(mockTx.collection.create).not.toHaveBeenCalled();
  });

  it("reuses an existing tag (case-insensitive) instead of creating a duplicate", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([{ id: "b1" }]);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      { id: "t-existing", userId: "u1", name: "AI", color: "#1d9bf0" },
    ]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);

    const mockTx = {
      tag: { create: vi.fn() },
      bookmarkTag: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      collection: { create: vi.fn() },
      collectionItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        createMany: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(mockTx as never)
    );

    const plan = orbitScanPlanSchema.parse({
      overview: {
        summary: "s",
        taggingStrategy: "t",
        collectionStrategy: "c",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "r",
          tags: [
            {
              name: "ai",
              color: "#ef4444",
              reason: "topic",
              reuseExisting: true,
            },
          ],
          collection: null,
        },
      ],
    });

    const result = await applyOrbitScanPlan({
      userId: "u1",
      plan,
      createCollections: true,
    });

    expect(mockTx.tag.create).not.toHaveBeenCalled();
    expect(result.createdTags).toBe(0);
    expect(result.reusedTags).toBe(1);
    expect(result.tagAssignments).toBe(1);

    const createManyArgs = vi.mocked(mockTx.bookmarkTag.createMany).mock.calls[0]?.[0];
    expect(createManyArgs?.data).toEqual([{ bookmarkId: "b1", tagId: "t-existing" }]);
  });

  it("appends a single bookmark to an existing collection instead of skipping it", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([{ id: "b1" }]);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        id: "c-existing",
        userId: "u1",
        name: "AI Papers",
        description: "My AI papers.",
        type: "user_collection",
        isPublic: false,
        shareSlug: null,
        externalSource: null,
        externalSourceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const mockTx = {
      tag: { create: vi.fn() },
      bookmarkTag: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      collection: { create: vi.fn() },
      collectionItem: {
        findFirst: vi.fn().mockResolvedValue({ sortOrder: 4 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(mockTx as never)
    );

    const plan = orbitScanPlanSchema.parse({
      overview: {
        summary: "s",
        taggingStrategy: "t",
        collectionStrategy: "c",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "r",
          tags: [],
          collection: {
            name: "ai papers",
            description: "Papers about AI.",
            reason: "fits existing",
            reuseExisting: true,
          },
        },
      ],
    });

    const result = await applyOrbitScanPlan({
      userId: "u1",
      plan,
      createCollections: true,
    });

    expect(mockTx.collection.create).not.toHaveBeenCalled();
    expect(result.createdCollections).toBe(0);
    expect(result.reusedCollections).toBe(1);
    expect(result.collectionAssignments).toBe(1);
    expect(result.skippedNewCollectionSingletons).toBe(0);

    const createManyArgs = vi
      .mocked(mockTx.collectionItem.createMany)
      .mock.calls[0]?.[0];
    expect(createManyArgs?.data).toEqual([
      { collectionId: "c-existing", bookmarkId: "b1", sortOrder: 5 },
    ]);
  });
});
