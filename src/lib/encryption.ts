import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY not set");
  if (key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        `Got ${key.length} characters. Generate one with: openssl rand -hex 32`
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("ENCRYPTION_KEY must contain only hexadecimal characters");
  }
  return Buffer.from(key, "hex");
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
}

export function decrypt(data: string): string {
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Invalid encrypted payload: expected a non-empty string");
  }

  const parts = data.split(":");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted payload: expected 3 colon-separated segments (iv:tag:ciphertext), got ${parts.length}`
    );
  }

  const [ivHex, tagHex, encrypted] = parts;
  if (!ivHex || !tagHex || !encrypted) {
    throw new Error(
      "Invalid encrypted payload: empty iv, tag, or ciphertext segment"
    );
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
