import { describe, expect, it } from "vitest";
import {
  buildOrbitCollectionRollups,
  buildOrbitScanSummary,
  normalizeOrbitScanPlan,
  orbitScanPlanSchema,
} from "@/lib/orbit-grok";

describe("normalizeOrbitScanPlan", () => {
  it("reuses existing tag and collection names and fills missing bookmarks", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "A first pass",
        taggingStrategy: "Use strong topic tags",
        collectionStrategy: "Reuse clear homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Useful AI systems bookmark",
          tags: [
            {
              name: " ai ",
              color: "#ef4444",
              reason: "AI topic",
              reuseExisting: false,
            },
            {
              name: "Tools",
              color: "#22c55e",
              reason: "Tooling bookmark",
              reuseExisting: false,
            },
            {
              name: "Tools",
              color: "#22c55e",
              reason: "Duplicate",
              reuseExisting: false,
            },
          ],
          collection: {
            name: " research ",
            description: "Deep work reads",
            reason: "Fits the research collection",
            reuseExisting: false,
          },
        },
      ],
    });

    const normalized = normalizeOrbitScanPlan(parsed, {
      bookmarkIds: ["b1", "b2"],
      existingTags: [{ name: "AI", color: "#1d9bf0" }],
      existingCollections: [{ name: "Research", description: "Saved research" }],
    });

    expect(normalized.suggestions).toHaveLength(2);
    expect(normalized.suggestions[0]).toMatchObject({
      bookmarkId: "b1",
      tags: [
        {
          name: "AI",
          color: "#1d9bf0",
          reuseExisting: true,
        },
        {
          name: "Tools",
          color: "#22c55e",
          reuseExisting: false,
        },
      ],
      collection: {
        name: "Research",
        description: "Saved research",
        reuseExisting: true,
      },
    });
    expect(normalized.suggestions[1]).toMatchObject({
      bookmarkId: "b2",
      confidence: "low",
      tags: [],
      collection: null,
    });
  });
});

describe("buildOrbitScanSummary", () => {
  it("aggregates tag and collection rollups from the normalized plan", () => {
    const parsed = orbitScanPlanSchema.parse({
      overview: {
        summary: "A first pass",
        taggingStrategy: "Use strong topic tags",
        collectionStrategy: "Reuse clear homes",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "Fits AI research",
          tags: [
            {
              name: "AI",
              color: "#1d9bf0",
              reason: "Topic",
              reuseExisting: true,
            },
          ],
          collection: {
            name: "Research",
            description: "Saved research",
            reason: "Shared theme",
            reuseExisting: true,
          },
        },
        {
          bookmarkId: "b2",
          confidence: "medium",
          reasoning: "Useful tools bookmark",
          tags: [
            {
              name: "Tools",
              color: "#22c55e",
              reason: "Tooling",
              reuseExisting: false,
            },
          ],
          collection: {
            name: "Research",
            description: "Saved research",
            reason: "Shared theme",
            reuseExisting: true,
          },
        },
      ],
    });

    expect(buildOrbitScanSummary(parsed)).toEqual({
      bookmarkCount: 2,
      bookmarksWithTags: 2,
      bookmarksWithCollections: 2,
      tagAssignments: 2,
      uniqueTags: 2,
      collectionBuckets: 1,
      reusedExistingTags: 1,
      reusedExistingCollections: 1,
      newCollectionBuckets: 0,
    });

    expect(buildOrbitCollectionRollups(parsed)).toEqual([
      {
        name: "Research",
        description: "Saved research",
        count: 2,
        reuseExisting: true,
        bookmarkIds: ["b1", "b2"],
      },
    ]);
  });
});
