import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchJsonError } from "@/lib/fetch-json";
import {
  applyOrbitScanProgressEvent,
  orbitScanProgressDetail,
  orbitScanProgressRatio,
  readNdjson,
  requestOrbitScanStream,
  startOrbitScanProgress,
} from "@/lib/orbit-scan-stream";
import type { OrbitScanProgressEvent, OrbitScanStreamLine } from "@/types";

/** A body that delivers the given text in arbitrary chunks. */
function chunkedBody(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function ndjson(lines: OrbitScanStreamLine[]) {
  return lines.map((line) => `${JSON.stringify(line)}\n`).join("");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readNdjson", () => {
  it("reassembles lines split across chunks and reads a final unterminated line", async () => {
    const lines: unknown[] = [];
    await readNdjson(
      chunkedBody(['{"a":', '1}\n{"b"', ":2}\n\n", '{"c":3}']),
      (line) => lines.push(line)
    );
    expect(lines).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});

describe("requestOrbitScanStream", () => {
  const payload = { scanRunId: "run-1" } as never;

  function stubFetch(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reports progress in order and resolves with the result", async () => {
    const fetchMock = stubFetch(
      new Response(
        chunkedBody([
          ndjson([
            { type: "phase", phase: "prepare" },
            { type: "phase", phase: "match" },
            { type: "row", bookmarkId: "b1", state: "matched", label: "AI" },
            { type: "result", payload },
          ]),
        ])
      )
    );
    const events: OrbitScanProgressEvent[] = [];

    await expect(
      requestOrbitScanStream({
        bookmarkIds: ["b1"],
        onProgress: (event) => events.push(event),
      })
    ).resolves.toEqual(payload);

    expect(events.map((event) => event.type)).toEqual(["phase", "phase", "row"]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      mode: "scan",
      bookmarkIds: ["b1"],
      stream: true,
    });
  });

  it("turns a streamed error into the same error sendJson throws", async () => {
    stubFetch(
      new Response(
        chunkedBody([
          ndjson([
            { type: "phase", phase: "prepare" },
            {
              type: "error",
              status: 502,
              error: { error: "TypeSafe rejected the request.", code: "typesafe_auth" },
            },
          ]),
        ])
      )
    );

    const failure = await requestOrbitScanStream({ bookmarkIds: ["b1"] }).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(FetchJsonError);
    expect(failure).toMatchObject({
      status: 502,
      body: { code: "typesafe_auth" },
    });
  });

  it("keeps JSON errors from before the stream starts", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Bookmark not found", code: "bookmark_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );
    await expect(
      requestOrbitScanStream({ bookmarkIds: ["b1"] })
    ).rejects.toMatchObject({ status: 404, message: "Bookmark not found" });
  });

  it("fails when the stream ends without a result", async () => {
    stubFetch(new Response(chunkedBody([ndjson([{ type: "phase", phase: "match" }])])));
    await expect(
      requestOrbitScanStream({ bookmarkIds: ["b1"] })
    ).rejects.toBeInstanceOf(FetchJsonError);
  });
});

describe("scan progress", () => {
  it("moves rows through match, naming, and named without going backwards", () => {
    let progress = startOrbitScanProgress(["b1", "b2", "b3", "b4"]);
    expect(orbitScanProgressRatio(progress)).toBeNull();
    expect(orbitScanProgressDetail(progress)).toBe(
      "Reading posts and your tagging history…"
    );

    const events: OrbitScanProgressEvent[] = [
      { type: "phase", phase: "match" },
      { type: "row", bookmarkId: "b1", state: "matched", label: "AI" },
      { type: "row", bookmarkId: "b2", state: "matched", label: "Design" },
      { type: "row", bookmarkId: "b3", state: "leftover", label: null },
      { type: "row", bookmarkId: "b4", state: "leftover", label: null },
    ];
    for (const event of events) progress = applyOrbitScanProgressEvent(progress, event);
    expect(orbitScanProgressDetail(progress)).toBe("2 of 4 matched to your tags");

    progress = applyOrbitScanProgressEvent(progress, {
      type: "phase",
      phase: "refine",
      bookmarkIds: ["b3", "b4"],
    });
    progress = applyOrbitScanProgressEvent(progress, {
      type: "row",
      bookmarkId: "b3",
      state: "matched",
      label: "Cooking",
    });
    expect(orbitScanProgressDetail(progress)).toBe(
      "3 of 4 matched · re-checking 1 against this batch's tags"
    );

    progress = applyOrbitScanProgressEvent(progress, {
      type: "phase",
      phase: "name",
      bookmarkIds: ["b4"],
    });
    expect(progress.rows.get("b4")?.state).toBe("naming");
    expect(orbitScanProgressDetail(progress)).toBe("3 of 4 matched · Grok is naming 1");
    expect(orbitScanProgressRatio(progress)).toBe(0.75);

    progress = applyOrbitScanProgressEvent(progress, {
      type: "named",
      bookmarkIds: ["b4"],
    });
    expect(progress).toMatchObject({ resolved: 4, naming: 0 });
    expect(progress.rows.get("b1")).toEqual({ state: "matched", label: "AI" });
  });

  it("names the whole batch on the Grok-only path", () => {
    const progress = applyOrbitScanProgressEvent(
      startOrbitScanProgress(["b1", "b2"]),
      { type: "phase", phase: "name", bookmarkIds: ["b1", "b2"] }
    );
    expect(orbitScanProgressDetail(progress)).toBe("Grok is naming 2");
    expect(orbitScanProgressRatio(progress)).toBeNull();
  });

  it("ignores rows outside the batch", () => {
    const progress = applyOrbitScanProgressEvent(startOrbitScanProgress(["b1"]), {
      type: "row",
      bookmarkId: "other",
      state: "matched",
      label: "AI",
    });
    expect(progress.rows.has("other")).toBe(false);
    expect(progress.resolved).toBe(0);
  });
});
