import { describe, expect, it } from "vitest";

import {
  contentSecurityPolicy,
  createContentSecurityPolicy,
} from "./content-security-policy";

const NONCE = "abcDEF123-_";

function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

describe("contentSecurityPolicy", () => {
  it("enforces a script nonce in production and leaves inline styles allowed", () => {
    const policy = contentSecurityPolicy(NONCE, {
      NODE_ENV: "production",
    });

    expect(policy.key).toBe("Content-Security-Policy");
    expect(directive(policy.value, "script-src")).toBe(
      `script-src 'self' 'nonce-${NONCE}'`
    );
    expect(directive(policy.value, "style-src")).toBe(
      "style-src 'self' 'unsafe-inline'"
    );
    expect(policy.value).toContain("upgrade-insecure-requests");
    expect(policy.value).not.toContain("strict-dynamic");
    expect(directive(policy.value, "connect-src")).toBe("connect-src 'self'");
  });

  it("stays report-only outside production unless CSP_MODE=enforce", () => {
    const reportOnly = contentSecurityPolicy(NONCE, { NODE_ENV: "development" });
    expect(reportOnly.key).toBe("Content-Security-Policy-Report-Only");
    expect(directive(reportOnly.value, "script-src")).toContain("'unsafe-eval'");
    expect(reportOnly.value).not.toContain("upgrade-insecure-requests");

    const enforced = contentSecurityPolicy(NONCE, {
      NODE_ENV: "development",
      CSP_MODE: "enforce",
    });
    expect(enforced.key).toBe("Content-Security-Policy");
  });

  it("honors a production report-only rollback", () => {
    const policy = contentSecurityPolicy(NONCE, {
      NODE_ENV: "production",
      CSP_MODE: "report-only",
    });
    expect(policy.key).toBe("Content-Security-Policy-Report-Only");
    expect(directive(policy.value, "script-src")).toContain(`'nonce-${NONCE}'`);
  });

  it("mints a new nonce for each policy", () => {
    const first = createContentSecurityPolicy({ NODE_ENV: "production" });
    const second = createContentSecurityPolicy({ NODE_ENV: "production" });
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.value).toContain(`'nonce-${first.nonce}'`);
  });
});
