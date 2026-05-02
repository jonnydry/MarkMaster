import { isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { highlightPlainText, highlightTweetText } from "@/lib/text-highlighter";

type ElementWithProps = ReactElement<{
  className?: string;
  href?: string;
}>;

const isElement = (node: ReactNode): node is ElementWithProps =>
  isValidElement(node);

describe("text highlighter", () => {
  it("returns plain text when there is no query match", () => {
    expect(highlightPlainText("No match here", "zzz")).toBe("No match here");
  });

  it("marks repeated plain-text matches without regex construction", () => {
    const highlighted = highlightPlainText("Alpha beta alpha", "alpha");

    expect(Array.isArray(highlighted)).toBe(true);
    const nodes = highlighted as ReactNode[];
    expect(isElement(nodes[0])).toBe(true);
    expect(nodes[1]).toBe(" beta ");
    expect(isElement(nodes[2])).toBe(true);
  });

  it("preserves mention and URL rendering while highlighting mentions", () => {
    const highlighted = highlightTweetText(
      "Read this from @Ada https://x.com/a",
      "ada"
    );

    expect(Array.isArray(highlighted)).toBe(true);
    const nodes = highlighted as ReactNode[];
    const elements = nodes.filter(isElement);
    expect(elements.length).toBeGreaterThan(0);
    expect(
      elements.some((el) => el.props.className === "font-medium text-primary")
    ).toBe(true);
    expect(
      elements.some(
        (el) => el.type === "a" && el.props.href === "https://x.com/a"
      )
    ).toBe(true);
  });
});
