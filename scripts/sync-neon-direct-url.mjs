import fs from "node:fs";

const path = ".env";
const env = fs.readFileSync(path, "utf8");
const match = env.match(/^DATABASE_URL=(.*)$/m);

if (!match) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const raw = match[1].trim().replace(/^["']|["']$/g, "");
let direct;

try {
  const url = new URL(raw);
  if (!url.hostname.includes("neon.tech")) {
    console.error(
      "DATABASE_URL does not look like Neon. For local Docker, set DIRECT_URL to the same value as DATABASE_URL.",
    );
    process.exit(1);
  }

  if (!url.hostname.includes("-pooler")) {
    console.error(
      "DATABASE_URL should use the pooled Neon host (-pooler in hostname). Copy the pooled string from console.neon.tech → Connect.",
    );
    process.exit(1);
  }

  url.hostname = url.hostname.replace("-pooler", "");
  direct = url.toString();
} catch {
  console.error("Could not parse DATABASE_URL");
  process.exit(1);
}

const directLine = `DIRECT_URL="${direct}"`;
let next = env;

if (/^DIRECT_URL=/m.test(next)) {
  next = next.replace(/^DIRECT_URL=.*$/m, directLine);
} else {
  next = next.replace(
    /^(DATABASE_URL=.*\n)/m,
    `$1\n# Direct connection for Prisma migrations (Neon: non-pooler host).\n${directLine}\n`,
  );
}

next = next.replace(
  /^# Direct connection for Prisma migrations \(local: same as DATABASE_URL\)\.\n/m,
  "# Direct connection for Prisma migrations (Neon: non-pooler host).\n",
);

fs.writeFileSync(path, next);
console.log("Set DIRECT_URL from DATABASE_URL (removed -pooler from hostname).");
