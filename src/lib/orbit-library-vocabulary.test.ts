import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  tag: { findMany: vi.fn(), createMany: vi.fn() },
  bookmark: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { ensureLibraryVocabulary, requestLibraryGrowthTags } = await import(
  "@/lib/orbit-library-vocabulary"
);

function untagged(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bm-${index}`,
    authorUsername: `author${index}`,
    tweetText: `Post ${index} about sourdough starters`,
    urls: null,
    media: null,
    xMetadata: null,
  }));
}

function xaiReply(tags: string[]) {
  return new Response(
    JSON.stringify({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ tags }) }],
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("XAI_API_KEY", "xai-key");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ensureLibraryVocabulary", () => {
  it("uses the user's tags when there are any", async () => {
    prismaMock.tag.findMany.mockResolvedValue([{ name: "AI", color: "#1d9bf0" }]);
    prismaMock.bookmark.findMany.mockResolvedValue([{ media: null }]);

    await expect(ensureLibraryVocabulary("user-1")).resolves.toEqual([
      { name: "AI", color: "#1d9bf0" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names a starter list without writing Tag rows up front", async () => {
    prismaMock.tag.findMany.mockResolvedValue([]);
    prismaMock.bookmark.findMany.mockResolvedValue(untagged(10));
    fetchMock.mockResolvedValue(xaiReply(["Sourdough", "Baking"]));

    const vocabulary = await ensureLibraryVocabulary("user-1");

    expect(vocabulary.map((tag) => tag.name)).toEqual(["Sourdough", "Baking"]);
    // Tags are created when a post is first tagged, so unused names never
    // become empty tags.
    expect(prismaMock.tag.createMany).not.toHaveBeenCalled();
  });
});

describe("requestLibraryGrowthTags", () => {
  it("names only tags that are not already on the list", async () => {
    prismaMock.bookmark.findMany.mockResolvedValue(untagged(12));
    fetchMock.mockResolvedValue(xaiReply(["Sourdough", "AI", "Fermentation"]));

    const growth = await requestLibraryGrowthTags("user-1", [
      { name: "AI", color: "#1d9bf0" },
    ]);

    expect(growth.map((tag) => tag.name)).toEqual(["Sourdough", "Fermentation"]);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      input: Array<{ content: string }>;
      prompt_cache_key: string;
    };
    expect(body.input[1]?.content).toContain("Existing tags: AI");
    expect(body.prompt_cache_key).toBe("markmaster-orbit-library-growth");
    expect(prismaMock.tag.createMany).not.toHaveBeenCalled();
  });

  it("skips Grok when too few posts are left", async () => {
    prismaMock.bookmark.findMany.mockResolvedValue(untagged(2));

    await expect(requestLibraryGrowthTags("user-1", [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing when Grok finds no shared topic", async () => {
    prismaMock.bookmark.findMany.mockResolvedValue(untagged(12));
    fetchMock.mockResolvedValue(xaiReply([]));

    await expect(requestLibraryGrowthTags("user-1", [])).resolves.toEqual([]);
  });
});
