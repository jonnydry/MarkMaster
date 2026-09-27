import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
}));

vi.mock("undici", () => {
  class Agent {
    connect: { lookup?: PinnedLookup };
    constructor(options: { connect?: { lookup?: PinnedLookup } } = {}) {
      this.connect = options.connect ?? {};
    }
  }
  return { fetch: mocks.fetch, Agent };
});

import { extractPreviewImageFromHtml, fetchPreviewImage, isPrivateIp, resolvePagePreviewImage } from "./link-preview";

type LookupAddress = { address: string; family: number };
type PinnedLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, addresses?: LookupAddress[]) => void
) => void;

const connections: string[] = [];

function publicAnswer() {
  return [{ address: "8.8.8.8", family: 4 }];
}

function asUrl(input: string | URL): URL {
  return input instanceof URL ? input : new URL(input);
}

async function invokePinnedLookup(
  init: { dispatcher?: { connect?: { lookup?: PinnedLookup } } } | undefined,
  hostname: string
): Promise<LookupAddress[]> {
  const lookup = init?.dispatcher?.connect?.lookup;
  if (!lookup) throw new Error("pinned lookup missing");
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses ?? []);
    });
  });
}

function installConnectingFetch(handler?: (url: URL) => Response) {
  connections.length = 0;
  mocks.fetch.mockImplementation(async (input: string | URL, init?: { dispatcher?: { connect?: { lookup?: PinnedLookup } } }) => {
    const url = asUrl(input);
    const addresses = await invokePinnedLookup(init, url.hostname);
    for (const entry of addresses) connections.push(`${url.hostname} -> ${entry.address}`);
    if (handler) return handler(url);
    const body = `<meta property="og:image" content="https://images.example/card.png" />`;
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  });
}

describe("link preview parsing", () => {
  beforeEach(() => {
    mocks.lookup.mockReset();
    mocks.fetch.mockReset();
    connections.length = 0;
    mocks.lookup.mockResolvedValue(publicAnswer());
  });

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
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIp("[::ffff:127.0.0.1]")).toBe(true);
    expect(isPrivateIp("::ffff:a9fe:a9fe")).toBe(true);
    expect(isPrivateIp("64:ff9b::7f00:1")).toBe(true);
    expect(isPrivateIp("2002:7f00:1::")).toBe(true);
    expect(isPrivateIp("fe90::1")).toBe(true);
    expect(isPrivateIp("ff02::1")).toBe(true);
    expect(isPrivateIp("198.18.0.1")).toBe(true);
    expect(isPrivateIp("192.0.0.1")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIp("64:ff9b::8.8.8.8")).toBe(false);
    expect(isPrivateIp("2002:808:808::")).toBe(false);
    expect(isPrivateIp("64:ff9b:1::8.8.8.8")).toBe(true);
  });

  it("returns null and does not connect when lookup is a private address", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    installConnectingFetch();

    await expect(fetchPreviewImage("https://cdn.example/photo.png")).resolves.toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(connections).toEqual([]);
  });

  it("does not connect when a checked lookup later returns a private address", async () => {
    let atConnect = false;
    mocks.lookup.mockImplementation(async () => {
      if (atConnect) return [{ address: "127.0.0.1", family: 4 }];
      return publicAnswer();
    });
    connections.length = 0;
    mocks.fetch.mockImplementation(async (input: string | URL, init?: { dispatcher?: { connect?: { lookup?: PinnedLookup } } }) => {
      const url = asUrl(input);
      atConnect = true;
      try {
        const addresses = await invokePinnedLookup(init, url.hostname);
        for (const entry of addresses) connections.push(entry.address);
      } finally {
        atConnect = false;
      }
      return new Response("ok", { status: 200 });
    });

    await expect(fetchPreviewImage("https://cdn.example/photo.png")).resolves.toBeNull();
    expect(mocks.fetch).toHaveBeenCalled();
    expect(connections).toEqual([]);
  });

  it("does not connect when any looked-up address is private", async () => {
    let atConnect = false;
    mocks.lookup.mockImplementation(async () => {
      if (!atConnect) return publicAnswer();
      return [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ];
    });
    connections.length = 0;
    mocks.fetch.mockImplementation(async (input: string | URL, init?: { dispatcher?: { connect?: { lookup?: PinnedLookup } } }) => {
      const url = asUrl(input);
      atConnect = true;
      try {
        const addresses = await invokePinnedLookup(init, url.hostname);
        for (const entry of addresses) connections.push(entry.address);
      } finally {
        atConnect = false;
      }
      return new Response("ok", { status: 200 });
    });

    await expect(fetchPreviewImage("https://cdn.example/mixed.png")).resolves.toBeNull();
    expect(connections).toEqual([]);
  });

  it("returns null when a redirect points at a host that resolves privately", async () => {
    mocks.lookup.mockImplementation(async (hostname: string) => {
      if (hostname === "internal.example") return [{ address: "127.0.0.1", family: 4 }];
      return publicAnswer();
    });
    const fetched: string[] = [];
    installConnectingFetch((url) => {
      fetched.push(url.hostname);
      if (url.hostname === "public.example") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://internal.example/secret" },
        });
      }
      return new Response("should not fetch the private host", { status: 200 });
    });

    await expect(fetchPreviewImage("https://public.example/a.png")).resolves.toBeNull();
    expect(fetched).toEqual(["public.example"]);
    expect(connections.some((entry) => entry.startsWith("internal.example"))).toBe(false);
  });

  it("rejects a non-default port before connecting", async () => {
    installConnectingFetch();

    await expect(fetchPreviewImage("https://public.example:8443/a.png")).resolves.toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects a redirect onto a non-default port", async () => {
    const fetched: string[] = [];
    installConnectingFetch((url) => {
      fetched.push(url.href);
      return new Response(null, {
        status: 302,
        headers: { location: "https://cdn.example:8443/a.png" },
      });
    });

    await expect(fetchPreviewImage("https://public.example/a.png")).resolves.toBeNull();
    expect(fetched).toEqual(["https://public.example/a.png"]);
  });

  it("allows the default https port", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    installConnectingFetch(() => new Response(jpeg, { status: 200 }));

    await expect(fetchPreviewImage("https://public.example:443/a.jpg")).resolves.toEqual({
      bytes: jpeg,
      contentType: "image/jpeg",
    });
    expect(connections).toEqual(["public.example -> 8.8.8.8"]);
  });

  it("evicts the oldest cached page image after 1000 entries", async () => {
    installConnectingFetch();

    for (let index = 0; index <= 1000; index += 1) {
      await expect(
        resolvePagePreviewImage(`https://page-${index}.example/post`)
      ).resolves.toBe("https://images.example/card.png");
    }

    mocks.fetch.mockClear();
    await expect(resolvePagePreviewImage("https://page-0.example/post")).resolves.toBe(
      "https://images.example/card.png"
    );
    expect(mocks.fetch).toHaveBeenCalled();

    mocks.fetch.mockClear();
    await expect(resolvePagePreviewImage("https://page-1000.example/post")).resolves.toBe(
      "https://images.example/card.png"
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
