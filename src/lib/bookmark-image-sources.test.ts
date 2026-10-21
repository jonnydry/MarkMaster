import { describe, expect, it } from "vitest";

import { selectBookmarkImageSources } from "./bookmark-image-sources";

describe("selectBookmarkImageSources", () => {
  it("uses a video thumbnail and keeps photos and link-card images", () => {
    const sources = selectBookmarkImageSources({
      media: [
        {
          type: "video",
          url: "https://pbs.twimg.com/poster.jpg",
          preview_image_url: "https://pbs.twimg.com/thumb.jpg",
          playback_url: "https://video.twimg.com/clip.mp4",
        },
        {
          type: "animated_gif",
          url: "https://video.twimg.com/only.mp4",
          playback_url: "https://video.twimg.com/only.mp4",
        },
        { type: "photo", url: "https://pbs.twimg.com/photo.jpg" },
      ],
      urls: [
        {
          expanded_url: "https://example.com/post",
          images: [{ url: "https://pbs.twimg.com/card.jpg", width: 800 }],
        },
        { images: [{ url: "https://pbs.twimg.com/photo.jpg" }] },
      ],
    });

    expect(sources.map((source) => source.url)).toEqual([
      "https://pbs.twimg.com/thumb.jpg",
      "https://pbs.twimg.com/photo.jpg",
      "https://pbs.twimg.com/card.jpg",
    ]);
    expect(sources.every((source) => source.mediaKey === source.url)).toBe(true);
    expect(new Set(sources.map((source) => source.contentHash)).size).toBe(sources.length);
  });

  it("falls back to a non-video url when a video has no separate thumbnail", () => {
    const sources = selectBookmarkImageSources({
      media: [{ type: "video", url: "https://pbs.twimg.com/poster.jpg" }],
    });
    expect(sources.map((source) => source.url)).toEqual(["https://pbs.twimg.com/poster.jpg"]);
  });
});
