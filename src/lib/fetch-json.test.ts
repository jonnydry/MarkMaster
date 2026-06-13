import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FetchJsonError, fetchJson, sendJson } from "@/lib/fetch-json";

describe("fetchJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON for successful responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(fetchJson<{ ok: boolean }>("/api/test")).resolves.toEqual({
      ok: true,
    });
  });

  it("validates successful responses when a schema is provided", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const schema = z.object({ ok: z.literal(true) });

    await expect(fetchJson("/api/test", undefined, schema)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects malformed successful responses when a schema is provided", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: "nope" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const schema = z.object({ ok: z.literal(true) });

    await expect(fetchJson("/api/test", undefined, schema)).rejects.toMatchObject({
      name: "FetchJsonError",
      message: "API response did not match expected shape",
      status: 200,
    } satisfies Partial<FetchJsonError>);
  });

  it("surfaces API error messages from JSON bodies", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Nope" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(fetchJson("/api/test")).rejects.toThrow("Nope");
  });
});

describe("sendJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends JSON bodies with the correct headers", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await sendJson<{ id: string }, { name: string }>("/api/test", {
      method: "POST",
      body: { name: "MarkMaster" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "MarkMaster" }),
        headers: expect.any(Headers),
      })
    );

    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Headers).get("Content-Type")).toBe(
      "application/json"
    );
  });

  it("validates JSON responses when sendJson receives a schema", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const schema = z.object({ id: z.string() });

    await expect(
      sendJson("/api/test", {
        method: "POST",
        body: { name: "MarkMaster" },
        schema,
      })
    ).resolves.toEqual({ id: "1" });
  });
});
