import { describe, expect, it } from "vitest";

import { ORBIT_MAX_TAGS_PER_BOOKMARK } from "@/lib/orbit-config";
import { normalizeOrbitScanPlan } from "@/lib/orbit-grok-parse";
import { ORBIT_STATIC_INSTRUCTIONS } from "@/lib/orbit-grok-prompt";
import { splitTagNames } from "@/lib/orbit-review";

function rawPlan(tagNames: string[]) {
  return {
    overview: {
      summary: "scan",
      taggingStrategy: "topics",
      collectionStrategy: "none",
    },
    suggestions: [
      {
        bookmarkId: "b1",
        confidence: "high" as const,
        reasoning: "topic match",
        tags: tagNames.map((name) => ({
          name,
          color: "#112233",
          reason: "topic",
        })),
        collection: null,
      },
    ],
  };
}

describe("video posts", () => {
  it("adds a Video tag and keeps it inside the per-post cap", () => {
    const topics = ["AI", "Design", "TypeScript", "React", "Maps"];
    const normalized = normalizeOrbitScanPlan(rawPlan(topics), {
      bookmarkIds: ["b1"],
      existingTags: [{ name: "Video", color: "#2563eb" }],
      existingCollections: [],
      bookmarks: [
        {
          id: "b1",
          media: [{ type: "video" }],
        },
      ],
    });

    const names = normalized.suggestions[0]?.tags.map((tag) => tag.name);
    expect(names).toEqual(["Video", "AI", "Design", "Typescript", "React"]);
    expect(names).toHaveLength(ORBIT_MAX_TAGS_PER_BOOKMARK);
    expect(normalized.suggestions[0]?.tags[0]).toMatchObject({
      name: "Video",
      color: "#2563eb",
      reuseExisting: true,
      reason: "This post includes a video.",
    });
  });

  it("leaves photo posts unchanged", () => {
    const normalized = normalizeOrbitScanPlan(rawPlan(["AI"]), {
      bookmarkIds: ["b1"],
      existingTags: [],
      existingCollections: [],
      bookmarks: [{ id: "b1", media: [{ type: "photo" }] }],
    });

    expect(normalized.suggestions[0]?.tags.map((tag) => tag.name)).toEqual(["AI"]);
  });

  it("tags a video bookmark that the scan otherwise skipped", () => {
    const normalized = normalizeOrbitScanPlan(
      {
        overview: {
          summary: "scan",
          taggingStrategy: "topics",
          collectionStrategy: "none",
        },
        suggestions: [],
      },
      {
        bookmarkIds: ["b1"],
        existingTags: [],
        existingCollections: [],
        bookmarks: [{ id: "b1", media: [{ type: "animated_gif" }] }],
      }
    );

    expect(normalized.suggestions[0]?.tags.map((tag) => tag.name)).toEqual(["Video"]);
    expect(normalized.suggestions[0]?.tags[0]?.reuseExisting).toBe(false);
  });
});

describe("tag cap", () => {
  it("keeps five tags in review drafts", () => {
    expect(splitTagNames("A, B, C, D, E, F")).toEqual(["A", "B", "C", "D", "E"]);
    expect(ORBIT_STATIC_INSTRUCTIONS.goal).toContain("up to 5 tags");
    expect(ORBIT_STATIC_INSTRUCTIONS.taggingRules.join(" ")).toContain("Max 5 tags");
  });
});
