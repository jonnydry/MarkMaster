import { describe, expect, it } from "vitest";

import { libraryTagProgressLabel } from "@/hooks/use-orbit-library-tag";
import { ORBIT_JEV_TAG_STRONG_THRESHOLD } from "@/lib/orbit-config";
import { freeLibraryTags, tagsFromPackedNouls } from "@/lib/orbit-library-assign";
import {
  parseLibraryVocabularyTags,
  selectStratifiedLibrarySample,
  type LibrarySampleBookmark,
} from "@/lib/orbit-library-sample";

function bookmark(
  id: string,
  author: string,
  extras: Partial<LibrarySampleBookmark> = {}
): LibrarySampleBookmark {
  return {
    id,
    authorUsername: author,
    tweetText: `${author} post ${id}`,
    urls: null,
    media: null,
    ...extras,
  };
}

describe("selectStratifiedLibrarySample", () => {
  it("covers distinct authors before repeating one", () => {
    const pool = [
      bookmark("1", "ada"),
      bookmark("2", "ada"),
      bookmark("3", "grace", {
        urls: [{ expanded_url: "https://github.com/grace/repo" }],
      }),
      bookmark("4", "ada", {
        xMetadata: {
          tweet: {
            context_annotations: [{ entity: { name: "Compilers" } }],
          },
        },
      }),
    ];

    const sample = selectStratifiedLibrarySample(pool, 3);
    expect(sample.map((item) => item.id)).toEqual(["1", "3", "4"]);
  });
});

describe("parseLibraryVocabularyTags", () => {
  it("drops generic names and keeps Video when the sample has video", () => {
    const names = parseLibraryVocabularyTags(
      { tags: ["Post", "machine learning", "Video", "https://example.com", "AI"] },
      { includeVideo: true }
    );

    expect(names).toEqual(["Machine Learning", "Video", "AI"]);
  });

  it("adds Video when the model omits it and the sample has video", () => {
    expect(
      parseLibraryVocabularyTags({ tags: ["Cooking"] }, { includeVideo: true })
    ).toEqual(["Video", "Cooking"]);
  });
});

describe("freeLibraryTags", () => {
  const vocabulary = [
    { name: "Compilers", color: "#111111" },
    { name: "Video", color: "#2563eb" },
  ];

  it("skips the model when a stored topic matches a tag", () => {
    const result = freeLibraryTags(
      {
        media: [{ type: "video" }],
        xMetadata: {
          tweet: { context_annotations: [{ entity: { name: "Compilers" } }] },
        },
      },
      vocabulary
    );

    expect(result.skipModel).toBe(true);
    expect(result.tags).toEqual(["Video", "Compilers"]);
  });

  it("keeps a video post on the model path when no topic matches", () => {
    const result = freeLibraryTags(
      { media: [{ type: "video" }], xMetadata: null },
      vocabulary
    );

    expect(result.skipModel).toBe(false);
    expect(result.tags).toEqual(["Video"]);
  });
});

describe("tagsFromPackedNouls", () => {
  it("keeps only strong matches and caps the list", () => {
    const assigned = tagsFromPackedNouls({
      posts: [{ id: "b1" }],
      tags: ["AI", "Design", "Cooking"],
      nouls: {
        p0t0: ORBIT_JEV_TAG_STRONG_THRESHOLD,
        p0t1: ORBIT_JEV_TAG_STRONG_THRESHOLD - 0.1,
        p0t2: 0.99,
      },
    });

    expect(assigned.get("b1")).toEqual(["Cooking", "AI"]);
  });
});

describe("libraryTagProgressLabel", () => {
  it("stays quiet until a run is active", () => {
    expect(libraryTagProgressLabel(false, 12, 40)).toBeNull();
  });

  it("reports tagged posts against what is still untagged", () => {
    expect(libraryTagProgressLabel(true, 12, 40)).toBe(
      "Tagging the library · 12 tagged · 40 still untagged"
    );
  });
});
