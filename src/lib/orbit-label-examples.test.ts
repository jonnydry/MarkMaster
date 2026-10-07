import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  tag: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logWarn: vi.fn() }));

const { normalizeTagKey } = await import("@/lib/orbit-grok-normalize");

const { formatLabelExample, loadOrbitLabelExamples, loadOrbitTagExamplesByName } =
  await import("@/lib/orbit-label-examples");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("formatLabelExample", () => {
  it("strips links, collapses whitespace, and trims long posts", () => {
    expect(formatLabelExample("Async   Rust in practice https://t.co/abc123")).toBe(
      "Async Rust in practice"
    );
    const long = formatLabelExample("word ".repeat(60));
    expect(long?.length).toBeLessThanOrEqual(100);
    expect(long?.endsWith("…")).toBe(true);
  });

  it("drops posts that say too little once links are gone", () => {
    expect(formatLabelExample("👀 https://t.co/abc")).toBeNull();
  });
});

describe("loadOrbitLabelExamples", () => {
  it("groups up to two usable examples per label", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { labelId: "tag-1", text: "Async Rust in practice, part two" },
        { labelId: "tag-1", text: "👀" },
        { labelId: "tag-1", text: "Borrow checker tips for new users" },
        { labelId: "tag-1", text: "A third Rust post that is not needed" },
      ])
      .mockResolvedValueOnce([]);

    const examples = await loadOrbitLabelExamples({
      userId: "user-1",
      tagIds: ["tag-1"],
      collectionIds: ["coll-1"],
    });

    expect(examples.tags.get("tag-1")).toEqual([
      "Async Rust in practice, part two",
      "Borrow checker tips for new users",
    ]);
    expect(examples.collections.size).toBe(0);
  });

  it("falls back to names alone when the query fails", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("db down"));

    const examples = await loadOrbitLabelExamples({
      userId: "user-1",
      tagIds: ["tag-1"],
      collectionIds: [],
    });

    expect(examples.tags.size).toBe(0);
  });

  it("skips the query when there are no labels", async () => {
    await loadOrbitLabelExamples({ userId: "user-1", tagIds: [], collectionIds: [] });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("loadOrbitTagExamplesByName", () => {
  it("keys examples the way library packs look tags up", async () => {
    prismaMock.tag.findMany.mockResolvedValue([{ id: "tag-1", name: "Machine Learning" }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { labelId: "tag-1", text: "Gradient descent, explained simply" },
    ]);

    const examples = await loadOrbitTagExamplesByName("user-1", ["Machine Learning"]);

    // Library packs read examples with normalizeTagKey, which folds aliases.
    expect(examples.get(normalizeTagKey("Machine Learning"))).toEqual([
      "Gradient descent, explained simply",
    ]);
  });
});
