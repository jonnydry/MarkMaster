// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GalleryBookmarkCard } from "@/components/gallery-bookmark-card";
import type { BookmarkWithRelations } from "@/types";

vi.mock("next/image", () => ({
  default: (props: {
    alt?: string;
    className?: string;
    onLoad?: () => void;
    onError?: () => void;
  }) => (
    <img
      alt={props.alt ?? ""}
      className={props.className}
      onLoad={props.onLoad}
      onError={props.onError}
    />
  ),
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
    expect(card?.className).toContain("active:border-primary/40");
    expect(card?.className).not.toContain("content-visibility");
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
    const preview = screen.getByAltText("Preview from @ada");
    expect(preview).toBeInTheDocument();
    expect(preview.className).toContain("opacity-0");
    expect(preview.className).toContain("group-active:scale-[1.012]");
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(document.querySelector("[data-gallery-caption]")).toHaveAttribute(
      "data-gallery-caption",
      "regular"
    );
    expect(
      screen.getByText("A long note about local archives and the coast").className
    ).toContain("line-clamp-2");
  });

  it("keeps a landscape caption to one line", () => {
    render(
      <GalleryBookmarkCard
        bookmark={bookmark({
          media: [{ type: "photo", url: "https://pbs.twimg.com/wide.jpg", width: 1600, height: 900 }],
        })}
        onSelect={() => {}}
      />
    );

    expect(document.querySelector("[data-gallery-caption]")).toHaveAttribute(
      "data-gallery-caption",
      "compact"
    );
    expect(
      screen.getByText("A long note about local archives and the coast").className
    ).toContain("line-clamp-1");
  });

  it("fades the poster in once the image loads", () => {
    render(
      <GalleryBookmarkCard
        bookmark={bookmark({
          media: [{ type: "photo", url: "https://pbs.twimg.com/photo.jpg", width: 800, height: 1200 }],
        })}
        onSelect={() => {}}
      />
    );

    const preview = screen.getByAltText("Preview from @ada");
    fireEvent.load(preview);
    expect(preview.className).toContain("opacity-100");
    expect(preview.className).not.toMatch(/(?:^|\s)opacity-0(?:\s|$)/);
  });

  it("replaces a broken image with the text poster", () => {
    render(
      <GalleryBookmarkCard
        bookmark={bookmark({
          media: [{ type: "photo", url: "https://pbs.twimg.com/photo.jpg", width: 800, height: 1200 }],
        })}
        onSelect={() => {}}
      />
    );

    fireEvent.error(screen.getByAltText("Preview from @ada"));

    const card = document.querySelector("[data-gallery-bookmark-card='bm-1']");
    expect(card).toHaveAttribute("data-gallery-card-variant", "text");
    expect(card).toHaveAttribute("data-gallery-image-fallback", "true");
    expect(screen.queryByText("Image")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Preview from @ada")).not.toBeInTheDocument();
    expect(
      screen.getByText("A long note about local archives and the coast").className
    ).toContain("line-clamp-6");
  });

  it("leaves collection and note chips inert", () => {
    render(
      <GalleryBookmarkCard
        bookmark={bookmark({
          collectionItems: [{ collection: { id: "c1", name: "Coast" } }],
          notes: [{ id: "n1", content: "Filed" }],
        })}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText("In collection").tagName).toBe("SPAN");
    expect(screen.getByText("Note").tagName).toBe("SPAN");
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
