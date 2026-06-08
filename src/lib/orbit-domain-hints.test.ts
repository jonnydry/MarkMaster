import { describe, expect, it } from "vitest";

import { getDomainHints } from "./orbit-domain-hints";

describe("getDomainHints", () => {
  it("maps known domains to content-type hints", () => {
    expect(
      getDomainHints(["arxiv.org", "github.com", "youtube.com", "example.com"])
    ).toEqual(["Paper", "Code", "Video"]);
  });

  it("dedupes repeated hint labels", () => {
    expect(getDomainHints(["arxiv.org", "www.arxiv.org"])).toEqual(["Paper"]);
  });
});