// `npm run db:migrate`: prisma migrate deploy behind the prod guard.
// Usage: npm run db:migrate [-- --prod]   (or MARKMASTER_ALLOW_PROD=1 in the shell)
// No other arguments are accepted.
//
// The guard checks the same DATABASE_URL and DIRECT_URL that Prisma will use:
// launch environment first, then .env, then prisma/.env (resolvePrismaEnv).
// Both must be set and pass. Prisma is then started with exactly that
// environment, so it cannot pick up a different value from a file.
import { spawnSync } from "node:child_process";

import { PROD_FLAG, enforceDatabaseWriteGuard, resolvePrismaEnv } from "./db-target-guard.mjs";

const argv = process.argv.slice(2);

// Only --prod is accepted. Anything else (e.g. --schema) could make Prisma
// read a different schema, datasource, or env file than the guard checked.
const unknownArgs = argv.filter((arg) => arg !== PROD_FLAG);
if (unknownArgs.length > 0) {
  console.error(
    [
      `Refusing to run prisma migrate deploy: unsupported argument${unknownArgs.length > 1 ? "s" : ""} ${unknownArgs.join(" ")}.`,
      `db:migrate accepts only ${PROD_FLAG}. Options such as --schema can point Prisma at a database the guard did not check.`,
      "Nothing was run.",
    ].join("\n")
  );
  process.exit(1);
}

const { env } = resolvePrismaEnv();

enforceDatabaseWriteGuard({
  action: "prisma migrate deploy",
  urls: { DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL },
  env,
  argv,
});

// Tests set this in the launch environment to stop after the checks, so they
// never start Prisma. It can only skip the migration, never widen it.
if (process.env.MARKMASTER_DB_MIGRATE_DRY_RUN === "1") {
  console.log("Dry run: checks passed; would run prisma migrate deploy.");
  process.exit(0);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["prisma", "migrate", "deploy"],
  { stdio: "inherit", env }
);
process.exit(result.status ?? 1);
