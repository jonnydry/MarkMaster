import { describe, expect, it } from "vitest";

import { extractPreviewImageFromHtml, isPrivateIp } from "./link-preview";

describe("link preview parsing", () => {
  it("reads an Open Graph image and resolves a relative URL", () => {
    const html = `
      <meta property="og:image" content="https://cdn-thumbnails.huggingface.co/social-thumbnails/models/orcarouter/OrcaSAQ-2-27B.png" />
      <meta name="twitter:image" content="/ignored.png" />
    `;

    expect(
      extractPreviewImageFromHtml(html, "https://huggingface.co/orcarouter/OrcaSAQ-2-27B")
    ).toBe(
      "https://cdn-thumbnails.huggingface.co/social-thumbnails/models/orcarouter/OrcaSAQ-2-27B.png"
    );
    expect(
      extractPreviewImageFromHtml(
        `<meta property="og:image" content="/preview.png" />`,
        "https://example.com/posts/1"
      )
    ).toBe("https://example.com/preview.png");
  });

  it("rejects private and loopback addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
});
