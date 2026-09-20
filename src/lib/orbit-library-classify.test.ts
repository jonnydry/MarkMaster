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
});
