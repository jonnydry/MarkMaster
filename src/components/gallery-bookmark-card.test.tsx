// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GalleryBookmarkCard } from "@/components/gallery-bookmark-card";
import type { BookmarkWithRelations } from "@/types";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ""} />,
}));

function bookmark(overrides: Partial<BookmarkWithRelations> = {}): BookmarkWithRelations {
  return {
    id: "bm-1",
    tweetId: "1",
    authorId: "a1",
    authorUsername: "ada",
    authorDisplayName: "Ada Marker",
    authorProfileImage: null,
    authorVerified: false,
    tweetText: "A long note about local archives and the coast",
    publicMetrics: {
      like_count: 12,
      retweet_count: 0,
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
    ...overrides,
  };
}

describe("GalleryBookmarkCard", () => {
  it("renders a text poster with the author and post", () => {
    render(<GalleryBookmarkCard bookmark={bookmark()} onSelect={() => {}} />);

    const card = document.querySelector("[data-gallery-bookmark-card='bm-1']");
    expect(card).toHaveAttribute("data-gallery-card-variant", "text");
    expect(card?.className).toContain("hover:bg-hover");
    expect(card?.className).toContain("hover:border-primary/25");
    expect(screen.getByText("Ada Marker")).toBeInTheDocument();
    expect(
      screen.getByText("A long note about local archives and the coast")
    ).toBeInTheDocument();
  });

  it("overlays the post on a thumbnail when the bookmark has media", () => {
    render(
      <GalleryBookmarkCard
        bookmark={bookmark({
          media: [{ type: "photo", url: "https://pbs.twimg.com/photo.jpg", width: 800, height: 1200 }],
        })}
        onSelect={() => {}}
        priorityMedia
      />
    );

    const card = document.querySelector("[data-gallery-bookmark-card='bm-1']");
    expect(card).toHaveAttribute("data-gallery-card-variant", "media");
    expect(screen.getByAltText("Preview from @ada")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(
      screen.getByText("A long note about local archives and the coast")
    ).toBeInTheDocument();
  });

  it("activates from the poster button", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<GalleryBookmarkCard bookmark={bookmark()} onSelect={onSelect} />);

    await user.click(
      screen.getByRole("button", { name: /Bookmark from Ada Marker/ })
    );
    expect(onSelect).toHaveBeenCalledWith("bm-1");
  });
});
