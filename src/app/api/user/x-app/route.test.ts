import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const getDbUser = vi.hoisted(() => vi.fn());
const rows = vi.hoisted(
  () => new Map<string, { xClientId: string | null; xClientSecret: string | null }>(),
);

vi.mock("@/lib/auth", () => ({
  getDbUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return rows.get(args.where.id) ?? null;
      }),
      update: vi.fn(
        async (args: {
          where: { id: string };
          data: { xClientId: string | null; xClientSecret: string | null };
        }) => {
          const current = rows.get(args.where.id) ?? {
            xClientId: null,
            xClientSecret: null,
          };
          rows.set(args.where.id, { ...current, ...args.data });
          return { id: args.where.id };
        },
      ),
    },
  },
}));

function put(body: unknown) {
  return new Request("http://localhost:3000/api/user/x-app", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/user/x-app", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    rows.clear();
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OWNER_USER_ID", "owner-1");
    getDbUser.mockResolvedValue({ id: "user-1" });
    const { encrypt } = await import("@/lib/encryption");
    rows.set("user-1", { xClientId: null, xClientSecret: null });
    rows.set("user-2", {
      xClientId: encrypt("client-user-2-2222"),
      xClientSecret: encrypt("secret-user-2-yyyy"),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 and does not read another row when signed out", async () => {
    getDbUser.mockResolvedValue(null);
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns only the signed-in user's masked status", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(json).toMatchObject({
      configured: false,
      unreadable: false,
      hostAppFallback: false,
      clientIdLast4: null,
      secretLast4: null,
    });
    expect(JSON.stringify(json)).not.toContain("secret-user-2-yyyy");

    getDbUser.mockResolvedValue({ id: "user-2" });
    const other = await (await GET()).json();
    expect(other).toMatchObject({
      configured: true,
      clientIdLast4: "2222",
      secretLast4: "yyyy",
    });
    expect(JSON.stringify(other)).not.toContain("secret-user-2-yyyy");
    expect(JSON.stringify(other)).not.toContain("client-user-2-2222");
  });

  it("encrypts a save on the session user and does not echo the secret", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { decrypt } = await import("@/lib/encryption");
    const { PUT } = await import("./route");
    const clientId = "client-user-1-1111";
    const clientSecret = "secret-user-1-zzzz";

    const response = await PUT(
      put({ clientId, clientSecret, userId: "user-2" }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain(clientSecret);
    expect(text).not.toContain(clientId);
    expect(text).toContain("zzzz");
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );

    const stored = rows.get("user-1");
    expect(stored?.xClientSecret).not.toContain(clientSecret);
    expect(decrypt(stored!.xClientId)).toBe(clientId);
    expect(decrypt(stored!.xClientSecret)).toBe(clientSecret);
    expect(decrypt(rows.get("user-2")!.xClientSecret)).toBe("secret-user-2-yyyy");
  });

  it("rejects a bad secret without storing it or repeating it", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PUT } = await import("./route");
    const secret = "secret with supersecretmarker";
    const response = await PUT(put({ clientId: "client-user-1-1111", clientSecret: secret }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toContain("supersecretmarker");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(rows.get("user-1")).toEqual({ xClientId: null, xClientSecret: null });
  });

  it("clears only the signed-in user's credentials", async () => {
    const { encrypt } = await import("@/lib/encryption");
    const { DELETE } = await import("./route");
    rows.set("user-1", {
      xClientId: encrypt("client-user-1-1111"),
      xClientSecret: encrypt("secret-user-1-zzzz"),
    });

    const response = await DELETE();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.configured).toBe(false);
    expect(rows.get("user-1")).toEqual({ xClientId: null, xClientSecret: null });
    expect(rows.get("user-2")?.xClientSecret).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("mm.x-app");
    expect(JSON.stringify(json)).not.toContain("secret-user-1-zzzz");
  });
});
