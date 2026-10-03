import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sign-out etag clearing", () => {
  it("routes account sign-out through the helper that drops graph etags", () => {
    const userNav = readFileSync("src/components/user-nav.tsx", "utf8");
    const settings = readFileSync(
      "src/app/(main)/settings/settings-client.tsx",
      "utf8"
    );

    expect(userNav).toContain('import { signOut } from "@/lib/client-sign-out"');
    expect(userNav).not.toContain("next-auth/react");
    expect(settings).toContain('import { signOut } from "@/lib/client-sign-out"');
    expect(settings).not.toContain("signOut } from \"next-auth/react\"");
    expect(settings.match(/signOut\(/g)?.length).toBe(2);
  });
});
