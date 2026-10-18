import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  bookmarkEmbeddingDocument,
  buildBookmarkEmbeddingText,
  type BookmarkEmbeddingSource,
} from "./bookmark-embedding-text";
import { EMBEDDING_DOCUMENT_PREFIX } from "./embedding-provider";

function source(overrides: Partial<BookmarkEmbeddingSource> = {}): BookmarkEmbeddingSource {
  return {
    tweetText: "Rust ownership notes",
    authorUsername: "@ada",
    authorDisplayName: "Ada Lovelace",
    urls: [
      { url: "https://t.co/abc", expanded_url: "https://example.com/a", display_url: "example.com", title: "Borrow checker" },
      { url: "https://t.co/def", expanded_url: "https://example.com/b", display_url: "example.com", title: "  " },
      { title: "Lifetimes" },
    ],
    quotedTweet: { id: "1", text: "  quoted body  ", author: { name: "Grace", username: "grace" } },
    tagNames: ["Rust", "compilers", "rust"],
    note: "read this later",
    ...overrides,
  };
}

describe("buildBookmarkEmbeddingText", () => {
  it("includes tweet text, author, link titles, quoted text, tags, and note", () => {
    expect(buildBookmarkEmbeddingText(source())).toBe(
      [
        "text: Rust ownership notes",
        "author: Ada Lovelace (@ada)",
        "links: Borrow checker | Lifetimes",
        "quoted: quoted body",
        "tags: compilers, Rust",
        "note: read this later",
      ].join("\n")
    );
  });

  it("omits empty sections and accepts a display name or handle alone", () => {
    expect(
      buildBookmarkEmbeddingText(
        source({
          tweetText: "   ",
          authorDisplayName: "",
          authorUsername: "ada",
          urls: [{ expanded_url: "https://example.com" }],
          quotedTweet: null,
          tagNames: [],
          note: "  ",
        })
      )
    ).toBe("author: @ada");

    expect(
      buildBookmarkEmbeddingText(
        source({
          tweetText: "only text",
          authorDisplayName: "Ada",
          authorUsername: "",
          urls: null,
          quotedTweet: null,
          tagNames: [" "],
          note: null,
        })
      )
    ).toBe("text: only text\nauthor: Ada");
  });

  it("reads titles and quoted text stored as JSON strings", () => {
    const text = buildBookmarkEmbeddingText(
      source({
        urls: JSON.stringify([{ title: "Paper" }]),
        quotedTweet: JSON.stringify({ text: "original" }),
        tagNames: [],
        note: null,
      })
    );
    expect(text).toContain("links: Paper");
    expect(text).toContain("quoted: original");
  });
});

describe("bookmarkEmbeddingDocument", () => {
  it("hashes the document prompt plus the body", () => {
    const document = bookmarkEmbeddingDocument(source());
    const expected = createHash("sha256")
      .update(`${EMBEDDING_DOCUMENT_PREFIX}${document.text}`)
      .digest("hex");

    expect(document.contentHash).toBe(expected);
  });

  it("changes the hash when the note changes and ignores tag order", () => {
    const first = bookmarkEmbeddingDocument(source());
    const reordered = bookmarkEmbeddingDocument(
      source({ tagNames: ["compilers", "Rust"] })
    );
    const edited = bookmarkEmbeddingDocument(source({ note: "done" }));

    expect(reordered.contentHash).toBe(first.contentHash);
    expect(edited.contentHash).not.toBe(first.contentHash);
  });
});
