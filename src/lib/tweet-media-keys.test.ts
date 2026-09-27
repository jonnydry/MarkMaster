import { describe, expect, it } from "vitest";

import { tweetMediaKeys } from "./tweet-media-keys";

describe("tweetMediaKeys", () => {
  it("includes an article cover ahead of attached media", () => {
    expect(
      tweetMediaKeys({
        article: { cover_media: "3_cover" },
        attachments: { media_keys: ["3_photo", "3_cover"] },
      })
    ).toEqual(["3_cover", "3_photo"]);
  });

  it("ignores an empty cover", () => {
    expect(
      tweetMediaKeys({
        article: { cover_media: "" },
        attachments: { media_keys: ["3_photo"] },
      })
    ).toEqual(["3_photo"]);
  });
});
