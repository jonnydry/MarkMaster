// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeScrollspyActiveId } from "./use-scrollspy";

function mockSection(id: string, top: number) {
  const el = document.createElement("section");
  el.id = id;
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(el);
  return el;
}

describe("computeScrollspyActiveId", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps the first section active before any section crosses the line", () => {
    mockSection("connection", 180);
    mockSection("sync", 520);
    expect(computeScrollspyActiveId(["connection", "sync"], 96)).toBe("connection");
  });

  it("activates the last section whose top has passed the offset", () => {
    mockSection("connection", 40);
    mockSection("sync", 60);
    mockSection("orbit-grok", 80);
    mockSection("appearance", 200);
    expect(
      computeScrollspyActiveId(
        ["connection", "sync", "orbit-grok", "appearance"],
        96
      )
    ).toBe("orbit-grok");
  });

  it("selects the final section when all tops are above the offset", () => {
    mockSection("tags", 20);
    mockSection("account", 40);
    expect(computeScrollspyActiveId(["tags", "account"], 96)).toBe("account");
  });
});
