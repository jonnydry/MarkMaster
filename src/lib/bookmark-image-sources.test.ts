import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { IMAGE_SOURCE_HASH_VERSION, imageContentHash, selectBookmarkImageSources } from "./bookmark-image-sources";

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

  it("drops images that are not on the fetch allowlist", () => {
    const sources = selectBookmarkImageSources({
      media: [
        { type: "photo", url: "https://example.com/photo.jpg" },
        { type: "photo", url: "http://pbs.twimg.com/plain.jpg" },
        {
          type: "video",
          preview_image_url: "https://example.com/thumb.jpg",
          url: "https://pbs.twimg.com/poster.jpg",
        },
      ],
      urls: [
        {
          images: [
            { url: "https://example.com/card.jpg" },
            { url: "https://ton.twimg.com/card.jpg" },
          ],
        },
      ],
    });
    expect(sources.map((source) => source.url)).toEqual([
      "https://pbs.twimg.com/poster.jpg",
      "https://ton.twimg.com/card.jpg",
    ]);
  });

  it("keeps the original URL as the stored image key", () => {
    const photo = "https://pbs.twimg.com/media/AbC123.jpg?format=jpg&name=large";
    const thumb = "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/abc.jpg";
    const amplify = "https://pbs.twimg.com/amplify_video_thumb/1/img/abc.jpg";
    const card = "https://ton.twimg.com/card.jpg";
    const sources = selectBookmarkImageSources({
      media: [
        { type: "photo", url: photo },
        { type: "video", preview_image_url: thumb, url: "https://video.twimg.com/clip.mp4" },
        { type: "video", preview_image_url: amplify, url: "https://video.twimg.com/amplify.mp4" },
      ],
      urls: [{ images: [{ url: card }] }],
    });
    const urls = [photo, thumb, amplify, card];
    expect(sources.map((source) => source.mediaKey)).toEqual(urls);
    expect(sources.map((source) => source.url)).toEqual(urls);
    expect(sources.map((source) => source.contentHash)).toEqual(urls.map((url) => imageContentHash(url)));
  });

  it("bumps the image source hash version", () => {
    expect(IMAGE_SOURCE_HASH_VERSION).toBe("image-v2");
    const url = "https://pbs.twimg.com/media/AbC123.jpg";
    const previous = createHash("sha256").update(`image-v1\0${url}`).digest("hex");
    expect(imageContentHash(url)).toBe(
      createHash("sha256").update(`${IMAGE_SOURCE_HASH_VERSION}\0${url}`).digest("hex")
    );
    expect(imageContentHash(url)).not.toBe(previous);
  });
});
