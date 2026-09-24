import { describe, expect, it } from "vitest";

import { filterSafeLibraryClassifyPlan } from "@/lib/orbit-library-classify";

describe("filterSafeLibraryClassifyPlan", () => {
  it("keeps only high-confidence reuse suggestions", () => {
    const filtered = filterSafeLibraryClassifyPlan({
      overview: {
        summary: "test",
        taggingStrategy: "noul",
        collectionStrategy: "choice",
      },
      suggestions: [
        {
          bookmarkId: "safe",
          confidence: "high",
          reasoning: "reuse",
          tags: [
            {
              name: "AI",
              color: "#1d9bf0",
              reason: "noul",
              reuseExisting: true,
            },
          ],
          collection: null,
        },
        {
          bookmarkId: "new-name",
          confidence: "high",
          reasoning: "new",
          tags: [
            {
              name: "Brand New",
              color: "#64748b",
              reason: "proposed",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
        {
          bookmarkId: "low",
          confidence: "medium",
          reasoning: "weak",
          tags: [
            {
              name: "AI",
              color: "#1d9bf0",
              reason: "noul",
              reuseExisting: true,
            },
          ],
          collection: null,
        },
      ],
    });

    expect(filtered.suggestions.map((suggestion) => suggestion.bookmarkId)).toEqual([
      "safe",
    ]);
  });

  it("keeps a video format tag even when the other tags are not safe to auto-apply", () => {
    const filtered = filterSafeLibraryClassifyPlan({
      overview: {
        summary: "test",
        taggingStrategy: "noul",
        collectionStrategy: "choice",
      },
      suggestions: [
        {
          bookmarkId: "video-only",
          confidence: "low",
          reasoning: "video",
          tags: [
            {
              name: "Video",
              color: "#2563eb",
              reason: "This post includes a video.",
              reuseExisting: false,
            },
            {
              name: "Guess",
              color: "#64748b",
              reason: "weak",
              reuseExisting: false,
            },
          ],
          collection: null,
        },
        {
          bookmarkId: "video-and-library",
          confidence: "high",
          reasoning: "both",
          tags: [
            {
              name: "Video",
              color: "#2563eb",
              reason: "This post includes a video.",
              reuseExisting: true,
            },
            {
              name: "AI",
              color: "#1d9bf0",
              reason: "noul",
              reuseExisting: true,
            },
          ],
          collection: null,
        },
      ],
    });

    expect(filtered.suggestions.map((suggestion) => suggestion.bookmarkId)).toEqual([
      "video-only",
      "video-and-library",
    ]);
    expect(filtered.suggestions[0]?.tags.map((tag) => tag.name)).toEqual(["Video"]);
    expect(filtered.suggestions[1]?.tags.map((tag) => tag.name)).toEqual([
      "Video",
      "AI",
    ]);
  });
});
