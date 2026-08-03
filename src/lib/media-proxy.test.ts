import { describe, expect, it } from "vitest";
import {
  createBoundedMediaStream,
  getDeclaredMediaSize,
  isValidMediaRange,
} from "./media-proxy";

describe("media proxy helpers", () => {
  it.each(["bytes=0-499", "bytes=500-", "bytes=-500"])(
    "accepts a single byte range: %s",
    (value) => expect(isValidMediaRange(value)).toBe(true)
  );

  it.each(["bytes=-", "bytes=10-1", "bytes=0-1,4-5", "items=0-1"])(
    "rejects unsafe or invalid ranges: %s",
    (value) => expect(isValidMediaRange(value)).toBe(false)
  );

  it("uses the full content-range size when present", () => {
    expect(
      getDeclaredMediaSize(
        new Headers({
          "content-length": "100",
          "content-range": "bytes 0-99/1000",
        })
      )
    ).toBe(1000);
  });

  it("errors when a chunked response exceeds its byte ceiling", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });

    await expect(new Response(createBoundedMediaStream(source, 3)).arrayBuffer()).rejects.toThrow(
      "byte limit"
    );
  });
});
