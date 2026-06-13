import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryption", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips plaintext through encrypt and decrypt", async () => {
    const { decrypt, encrypt } = await import("./encryption");
    const plaintext = "access-token-abc123";

    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces distinct ciphertext for the same input", async () => {
    const { encrypt } = await import("./encryption");
    const first = encrypt("same-value");
    const second = encrypt("same-value");

    expect(first).not.toBe(second);
  });

  it("rejects invalid encrypted payload shape", async () => {
    const { decrypt } = await import("./encryption");

    expect(() => decrypt("not-valid")).toThrow(/Invalid encrypted payload/);
  });

  it("requires a 64-character hex ENCRYPTION_KEY", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "too-short");
    vi.resetModules();
    const { encrypt } = await import("./encryption");

    expect(() => encrypt("secret")).toThrow(/64 hex characters/);
  });
});
