import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

function mockUpstreamResponse(
  body: BodyInit | null,
  init: ResponseInit,
  url = "https://video.twimg.com/video.mp4"
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", {
    value: url,
    configurable: true,
  });
  return response;
}

describe("/api/media", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    const { getDbUser } = await import("@/lib/auth");
    vi.mocked(getDbUser).mockResolvedValue({ id: "user-1" });
  });

  it("returns 401 when not authenticated", async () => {
    const { getDbUser } = await import("@/lib/auth");
    vi.mocked(getDbUser).mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://video.twimg.com/video.mp4"
      )
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a missing url", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/media"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Missing url parameter");
  });

  it("returns 400 for a disallowed host", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://example.com/video.mp4"
      )
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("URL not allowed");
  });

  it("proxies allowed media and forwards relevant headers", async () => {
    const { GET } = await import("./route");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockUpstreamResponse(body, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "3",
          etag: '"abc"',
        },
      })
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://video.twimg.com/video.mp4"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("etag")).toBe('"abc"');
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
  });

  it("returns 413 for oversized content-length", async () => {
    const { GET } = await import("./route");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockUpstreamResponse(null, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(200 * 1024 * 1024),
        },
      })
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://video.twimg.com/video.mp4"
      )
    );

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Media too large");
  });

  it("returns 502 for unsupported content-type", async () => {
    const { GET } = await import("./route");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockUpstreamResponse(null, {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      })
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://video.twimg.com/video.mp4"
      )
    );

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toBe("Unsupported media type");
  });

  it("returns 502 for a redirect to a disallowed host", async () => {
    const { GET } = await import("./route");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockUpstreamResponse(
        null,
        { status: 200, headers: { "content-type": "video/mp4" } },
        "https://evil.com/video.mp4"
      )
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://video.twimg.com/video.mp4"
      )
    );

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toBe("URL not allowed");
  });

  it("returns 502 for an upstream fetch failure", async () => {
    const { GET } = await import("./route");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new Error("network down"));

    const response = await GET(
      new NextRequest(
        "http://localhost/api/media?url=https://video.twimg.com/video.mp4"
      )
    );

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toBe("Upstream fetch failed");
  });
});
