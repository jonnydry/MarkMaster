// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookmarkCard } from "@/components/bookmark-card";
import { GridBookmarkCard } from "@/components/grid-bookmark-card";
import type { BookmarkWithRelations } from "@/types";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ""} />,
}));

function bookmark(imageMatch?: boolean): BookmarkWithRelations {
  return {
    id: "bm-1",
    tweetId: "1",
    authorId: "a1",
    authorUsername: "ada",
    authorDisplayName: "Ada",
    authorProfileImage: null,
    authorVerified: false,
    tweetText: "A chart of the coast",
    publicMetrics: {
      like_count: 3,
      retweet_count: 1,
      reply_count: 0,
      quote_count: 0,
      bookmark_count: 0,
    },
    media: null,
    urls: null,
    quotedTweet: null,
    xMetadata: null,
    tweetCreatedAt: "2026-09-01T00:00:00.000Z",
    bookmarkedAt: "2026-09-02T00:00:00.000Z",
    tags: [],
    collectionItems: [],
    notes: [],
    ...(imageMatch ? { imageMatch: true } : {}),
  };
}

describe("image match label", () => {
  it("shows Image match on feed, compact, and grid rows that matched by image", () => {
    const feed = render(<BookmarkCard bookmark={bookmark(true)} viewMode="feed" />);
    expect(screen.getByText("Image match")).toBeInTheDocument();
    feed.unmount();

    const compact = render(<BookmarkCard bookmark={bookmark(true)} viewMode="compact" />);
    expect(screen.getByText("Image match")).toBeInTheDocument();
    compact.unmount();

    render(<GridBookmarkCard bookmark={bookmark(true)} />);
    expect(screen.getByText("Image match")).toBeInTheDocument();
  });

  it("stays off a row that did not match by image", () => {
    render(<BookmarkCard bookmark={bookmark()} viewMode="feed" />);
    expect(screen.queryByText("Image match")).not.toBeInTheDocument();
  });
});
