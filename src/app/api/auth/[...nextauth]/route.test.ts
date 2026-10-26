import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => vi.fn(async () => null as Response | null));
const getHandler = vi.hoisted(() => vi.fn(async () => new Response("get-ok")));
const postHandler = vi.hoisted(() => vi.fn(async () => new Response("post-ok")));

vi.mock("@/lib/x-oauth-gate", () => ({
  blockTwitterOAuthIfUnconfigured: gate,
}));

vi.mock("@/lib/auth", () => ({
  handlers: { GET: getHandler, POST: postHandler },
}));

describe("/api/auth/[...nextauth]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.mockResolvedValue(null);
  });

  it("dispatches GET and POST to Auth.js when the account may continue", async () => {
    const { GET, POST } = await import("./route");
    const getResponse = await GET(
      new NextRequest("http://localhost:3000/api/auth/session"),
    );
    const postResponse = await POST(
      new NextRequest("http://localhost:3000/api/auth/signin/twitter", {
        method: "POST",
      }),
    );

    expect(await getResponse.text()).toBe("get-ok");
    expect(await postResponse.text()).toBe("post-ok");
    expect(getHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledTimes(1);
  });

  it("does not call Auth.js when the X app gate blocks the request", async () => {
    gate.mockResolvedValue(
      Response.json({ url: "http://localhost:3000/settings?xApp=required#sync" }),
    );
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/auth/signin/twitter", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(body.url).toContain("/settings?xApp=required");
    expect(getHandler).not.toHaveBeenCalled();
    expect(postHandler).not.toHaveBeenCalled();
  });
});
