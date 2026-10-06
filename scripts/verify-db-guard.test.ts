import { describe, expect, it } from "vitest";
import { assertVerifyDatabase } from "./verify-db-guard.mjs";

const LOCAL = "postgresql://user:password@127.0.0.1:54329/markmaster_verify";

describe("assertVerifyDatabase", () => {
  it("refuses a remote host", () => {
    const result = assertVerifyDatabase(
      "postgresql://user:password@ep-cool-paper.us-east-2.aws.neon.tech/markmaster_verify",
      "1"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("neon.tech");
  });

  it("refuses localhost with the wrong database name", () => {
    const result = assertVerifyDatabase(
      "postgresql://user:password@localhost:5432/markmaster",
      "1"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("/markmaster");
  });

  it("refuses a missing VERIFY_MARKMASTER flag", () => {
    const result = assertVerifyDatabase(LOCAL, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("VERIFY_MARKMASTER=1");
  });

  it("refuses an unparseable URL", () => {
    const result = assertVerifyDatabase("not a url", "1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("not a parseable URL");
  });

  it("accepts the local verify database when the flag is set", () => {
    expect(assertVerifyDatabase(LOCAL, "1")).toEqual({ ok: true });
  });
});
