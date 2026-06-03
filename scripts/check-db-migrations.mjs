import "dotenv/config";
import { spawnSync } from "node:child_process";

if (process.env.SKIP_DB_MIGRATION_CHECK === "1") {
  console.warn(
    "Skipping database migration check because SKIP_DB_MIGRATION_CHECK=1."
  );
  process.exit(0);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["prisma", "migrate", "status"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

if (result.status === 0) {
  console.log("Database migrations are up to date.");
  process.exit(0);
}

const pendingMigrations =
  output.includes("Following migrations have not yet been applied") ||
  output.includes("Database schema is not in sync");

if (pendingMigrations) {
  console.error(
    [
      "Database migrations are pending.",
      "",
      "This check did not change your database.",
      "Run: npm run db:migrate",
      "Then run: npm run dev",
      "",
      "For frontend-only work when you intentionally do not want a DB check:",
      "Run: npm run dev:unchecked",
    ].join("\n")
  );
  if (output) {
    console.error(`\nPrisma output:\n${output}`);
  }
  process.exit(result.status ?? 1);
}

console.error(
  [
    "Could not verify database migration status.",
    "",
    "This usually means DATABASE_URL is missing, the database is unreachable, or Prisma could not inspect the schema.",
    "Run: npm run db:status",
  ].join("\n")
);
if (output) {
  console.error(`\nPrisma output:\n${output}`);
}

process.exit(result.status ?? 1);
