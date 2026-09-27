import { describe, expect, it } from "vitest";

import {
  bookmarkThumbnailPlan,
  cardPageUrlFromMetadata,
  directThumbnailUrl,
  isPreviewablePageUrl,
  urlsWithCardImage,
} from "./bookmark-preview";

describe("bookmark previews", () => {
  it("prefers attached media over a link-card image", () => {
    expect(
      directThumbnailUrl({
        media: [{ type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" }],
        urls: [
          {
            expanded_url: "https://example.com",
            images: [{ url: "https://pbs.twimg.com/news_img/card.jpg", width: 1200 }],
          },
        ],
      })
    ).toBe("https://pbs.twimg.com/media/photo.jpg");
  });

  it("uses the widest stored Twitter card image when the post has no media", () => {
    expect(
      directThumbnailUrl({
        media: null,
        urls: [
          {
            expanded_url: "https://example.com/post",
            images: [
              { url: "https://pbs.twimg.com/news_img/small.jpg", width: 150, height: 150 },
              { url: "https://pbs.twimg.com/news_img/large.jpg", width: 1200, height: 630 },
            ],
          },
        ],
      })
    ).toBe("https://pbs.twimg.com/news_img/large.jpg");
  });

  it("proxies a long-post link that was not copied onto the urls column", () => {
    const page = cardPageUrlFromMetadata({
      tweet: {
        note_tweet: {
          entities: {
            urls: [{ expanded_url: "https://huggingface.co/orcarouter/OrcaSAQ-2-27B" }],
          },
        },
      },
    });

    expect(page).toBe("https://huggingface.co/orcarouter/OrcaSAQ-2-27B");
    expect(
      bookmarkThumbnailPlan({ id: "bm_1", media: null, urls: null, cardUrl: page })
    ).toEqual({
      src: "/api/bookmarks/bm_1/card-image",
      optimized: false,
    });
  });

  it("does not preview links that only point back at X", () => {
    expect(isPreviewablePageUrl("https://x.com/someone/status/1")).toBe(false);
    expect(isPreviewablePageUrl("https://t.co/abc")).toBe(false);
    expect(isPreviewablePageUrl("http://127.0.0.1/secret")).toBe(false);
  });

  it("stores a discovered card image on the matching link", () => {
    expect(
      urlsWithCardImage(
        [{ expanded_url: "https://huggingface.co/model", display_url: "huggingface.co/model" }],
        "https://huggingface.co/model",
        "https://cdn.example/preview.png"
      )
    ).toEqual([
      {
        expanded_url: "https://huggingface.co/model",
        display_url: "huggingface.co/model",
        images: [{ url: "https://cdn.example/preview.png" }],
      },
    ]);
  });
});
