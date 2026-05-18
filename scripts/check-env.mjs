import "dotenv/config";
import fs from "node:fs";

const required = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH_TWITTER_ID",
  "AUTH_TWITTER_SECRET",
  "ENCRYPTION_KEY",
];

let ok = true;
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
    console.log(
      "Rate limiting: Using in-memory fallback (fine for development). For production / multi-instance deploys, set UPSTASH_REDIS_REST_URL + TOKEN (or use Vercel KV)."
    );
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
  } catch (e) {
    // Non-fatal
  }
}
process.exit(ok ? 0 : 1);
