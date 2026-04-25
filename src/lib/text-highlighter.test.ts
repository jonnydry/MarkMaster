import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { highlightPlainText, highlightTweetText } from "@/lib/text-highlighter";

describe("text highlighter", () => {
  it("returns plain text when there is no query match", () => {
    expect(highlightPlainText("No match here", "zzz")).toBe("No match here");
  });

  it("marks repeated plain-text matches without regex construction", () => {
    const highlighted = highlightPlainText("Alpha beta alpha", "alpha");

    expect(Array.isArray(highlighted)).toBe(true);
    const nodes = highlighted as unknown[];
    expect(isValidElement(nodes[0])).toBe(true);
    expect(nodes[1]).toBe(" beta ");
    expect(isValidElement(nodes[2])).toBe(true);
  });

  it("preserves mention and URL rendering while highlighting mentions", () => {
    const highlighted = highlightTweetText("Read this from @Ada https://x.com/a", "ada");

    expect(Array.isArray(highlighted)).toBe(true);
    const nodes = highlighted as unknown[];
    expect(nodes.some((node) => isValidElement(node))).toBe(true);
    expect(
      nodes.some(
        (node) =>
          isValidElement(node) &&
          node.props.className === "font-medium text-primary"
      )
    ).toBe(true);
    expect(
      nodes.some(
        (node) =>
          isValidElement(node) &&
          node.type === "a" &&
          node.props.href === "https://x.com/a"
      )
    ).toBe(true);
  });
});
