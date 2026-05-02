import { describe, expect, it } from "vitest";

import {
  buildReviewedOrbitPlan,
  createOrbitReviewDraft,
  type OrbitReviewSuggestionDraft,
} from "@/lib/orbit-review";
import type { CollectionWithCount, OrbitScanPlan, TagWithCount } from "@/types";

const sourcePlan: OrbitScanPlan = {
  overview: {
    summary: "Summary",
    taggingStrategy: "Tags",
    collectionStrategy: "Collections",
  },
  suggestions: [
    {
      bookmarkId: "b1",
      confidence: "high",
      reasoning: "Because it is about AI tools.",
      tags: [
        {
          name: "AI",
          color: "#1d9bf0",
          reason: "Topic",
          reuseExisting: true,
        },
        {
          name: "Tools",
          color: "#22c55e",
          reason: "Utility",
          reuseExisting: false,
        },
      ],
      collection: {
        name: "AI Research",
        description: "Research papers and references.",
        reason: "Reusable home",
        reuseExisting: false,
      },
    },
    {
      bookmarkId: "b2",
      confidence: "medium",
      reasoning: "Because it is about design systems.",
      tags: [],
      collection: null,
    },
  ],
};

const existingTags: TagWithCount[] = [
  { id: "t1", name: "Research", color: "#f59e0b", _count: { bookmarks: 8 } },
];

const existingCollections: CollectionWithCount[] = [
  {
    id: "c1",
    name: "Design Systems",
    description: "Reusable UI patterns.",
    type: "user_collection",
    isPublic: false,
    shareSlug: null,
    externalSource: null,
    externalSourceId: null,
    createdAt: "2026-04-23T00:00:00.000Z",
    _count: { items: 4 },
  },
];

describe("createOrbitReviewDraft", () => {
  it("turns scan suggestions into editable strings", () => {
    expect(createOrbitReviewDraft(sourcePlan)).toEqual([
      {
        bookmarkId: "b1",
        included: true,
        tagNames: "AI, Tools",
        collectionName: "AI Research",
        collectionDescription: "Research papers and references.",
      },
      {
        bookmarkId: "b2",
        included: true,
        tagNames: "",
        collectionName: "",
        collectionDescription: "",
      },
    ]);
  });
});

describe("buildReviewedOrbitPlan", () => {
  it("uses edited tags and collection moves when applying", () => {
    const drafts: OrbitReviewSuggestionDraft[] = [
      {
        bookmarkId: "b1",
        included: true,
        tagNames: "Research, AI, Research",
        collectionName: "Design Systems",
        collectionDescription: "",
      },
    ];

    const reviewed = buildReviewedOrbitPlan({
      sourcePlan,
      drafts,
      existingTags,
      existingCollections,
    });

    expect(reviewed.suggestions).toHaveLength(1);
    expect(reviewed.suggestions[0]).toMatchObject({
      bookmarkId: "b1",
      tags: [
        {
          name: "Research",
          color: "#f59e0b",
          reuseExisting: true,
        },
        {
          name: "AI",
          color: "#1d9bf0",
          reuseExisting: true,
        },
      ],
      collection: {
        name: "Design Systems",
        description: "Reusable UI patterns.",
        reuseExisting: true,
      },
    });
  });

  it("omits unchecked and empty reviewed suggestions", () => {
    const drafts: OrbitReviewSuggestionDraft[] = [
      {
        bookmarkId: "b1",
        included: false,
        tagNames: "AI",
        collectionName: "AI Research",
        collectionDescription: "Research papers and references.",
      },
      {
        bookmarkId: "b2",
        included: true,
        tagNames: "",
        collectionName: "",
        collectionDescription: "",
      },
    ];

    const reviewed = buildReviewedOrbitPlan({
      sourcePlan,
      drafts,
      existingTags,
      existingCollections,
    });

    expect(reviewed.suggestions).toEqual([]);
  });
});
