import { describe, it, expect } from "vitest";
import type { XMedia } from "./x-api";
import {
  pickBestMp4Variant,
  mapStoredBookmarkMedia,
  hasVideoLikeMedia,
  getMediaPosterUrl,
} from "./bookmark-media";

describe("pickBestMp4Variant", () => {
  it("returns undefined when variants are missing or empty", () => {
    expect(pickBestMp4Variant({ media_key: "1", type: "video" })).toBeUndefined();
    expect(
      pickBestMp4Variant({ media_key: "1", type: "video", variants: [] })
    ).toBeUndefined();
  });

  it("ignores non-mp4 variants", () => {
    const media: XMedia = {
      media_key: "1",
      type: "video",
      variants: [
        { content_type: "application/x-mpegURL", url: "https://example.com/a.m3u8" },
      ],
    };
    expect(pickBestMp4Variant(media)).toBeUndefined();
  });

  it("picks the highest bit_rate mp4", () => {
    const media: XMedia = {
      media_key: "1",
      type: "video",
      variants: [
        {
          bit_rate: 256000,
          content_type: "video/mp4",
          url: "https://video.twimg.com/low.mp4",
        },
        {
          bit_rate: 2176000,
          content_type: "video/mp4",
          url: "https://video.twimg.com/high.mp4",
        },
      ],
    };
    expect(pickBestMp4Variant(media)).toBe("https://video.twimg.com/high.mp4");
  });
});

describe("mapStoredBookmarkMedia", () => {
  it("stores poster url for video and omits playback_url without variants", () => {
    const result = mapStoredBookmarkMedia([
      {
        media_key: "v1",
        type: "video",
        preview_image_url: "https://pbs.twimg.com/poster.jpg",
      },
    ]);
    expect(result[0]).toEqual({
      type: "video",
      url: "https://pbs.twimg.com/poster.jpg",
      preview_image_url: "https://pbs.twimg.com/poster.jpg",
      width: undefined,
      height: undefined,
    });
  });
});

describe("hasVideoLikeMedia", () => {
  it("returns true for video or gif", () => {
    expect(hasVideoLikeMedia([{ type: "photo" }, { type: "video" }])).toBe(true);
    expect(hasVideoLikeMedia([{ type: "animated_gif" }])).toBe(true);
    expect(hasVideoLikeMedia([{ type: "photo" }])).toBe(false);
    expect(hasVideoLikeMedia(null)).toBe(false);
  });
});

describe("getMediaPosterUrl", () => {
  it("prefers preview_image_url over url", () => {
    expect(
      getMediaPosterUrl({
        type: "photo",
        preview_image_url: "https://a/preview.jpg",
        url: "https://a/full.jpg",
      })
    ).toBe("https://a/preview.jpg");
  });
});
