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
}
process.exit(ok ? 0 : 1);
