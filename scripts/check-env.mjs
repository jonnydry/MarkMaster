import "dotenv/config";
import fs from "node:fs";

const required = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH_TWITTER_ID",
  "AUTH_TWITTER_SECRET",
  "ENCRYPTION_KEY",
];

let ok = true;
const isProduction =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const configuredAuthUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
let usesLoopbackAuthUrl = false;
try {
  const hostname = new URL(configuredAuthUrl).hostname;
  usesLoopbackAuthUrl =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
} catch {
  usesLoopbackAuthUrl = false;
}
for (const key of required) {
  const v = process.env[key];
  if (v == null || String(v).trim() === "") {
    console.error(`Missing or empty: ${key}`);
    ok = false;
  }
}

if (ok) {
  console.log("All required environment variables are set.");
  if (process.env.XAI_API_KEY?.trim()) {
    console.log("Optional: XAI_API_KEY is set — Grok Orbit scan can call xAI.");
  } else {
    console.log(
      "Optional: XAI_API_KEY is unset — Grok Orbit scan stays disabled until you add it (see README)."
    );
  }

  // Rate limiting (Phase 0 remediation)
  if (process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()) {
    console.log("Production: UPSTASH_REDIS_REST_* vars detected — using distributed rate limiting.");
  } else {
    const message =
      "Rate limiting: disabled for development. Production requires UPSTASH_REDIS_REST_URL + TOKEN and fails closed without them.";
    if (isProduction) {
      console.error(`Missing production configuration: ${message}`);
      ok = false;
    } else {
      console.log(message);
    }
  }

  if (
    isProduction &&
    process.env.VERCEL !== "1" &&
    !usesLoopbackAuthUrl &&
    process.env.AUTH_TRUST_HOST !== "true"
  ) {
    console.error(
      "Missing production configuration: self-hosted Auth.js requires AUTH_TRUST_HOST=true behind a trusted reverse proxy."
    );
    ok = false;
  }

  const cspMode = process.env.CSP_MODE?.trim();
  if (cspMode && cspMode !== "enforce" && cspMode !== "report-only") {
    console.error('Invalid CSP_MODE: expected "enforce" or "report-only".');
    ok = false;
  }

  // Local security hygiene: warn if .env has overly permissive permissions (Unix/macOS only)
  try {
    if (process.platform !== "win32" && fs.existsSync(".env")) {
      const stats = fs.statSync(".env");
      const mode = stats.mode & 0o777; // last 9 bits
      if (mode & 0o077) {
        // group or others have any permission
        console.warn(
          "\n⚠️  Security warning: .env file permissions are too open (" +
            mode.toString(8) +
            ").\n   Run: chmod 600 .env   (recommended for local development)"
        );
      }
    }
  } catch {
    // Non-fatal
  }
}
process.exit(ok ? 0 : 1);
