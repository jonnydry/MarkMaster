import "dotenv/config";

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
}
process.exit(ok ? 0 : 1);
