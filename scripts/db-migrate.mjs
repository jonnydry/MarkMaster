// `npm run db:migrate`: prisma migrate deploy behind the prod guard.
// Usage: npm run db:migrate [-- --prod]   (or MARKMASTER_ALLOW_PROD=1 in the shell)
// No other arguments are accepted, and Prisma always gets
// --schema prisma/schema.prisma, so the schema and its datasource env vars are
// the ones the guard checked. A package.json "prisma" key or a Prisma config
// file or folder could also redirect Prisma (a config can even replace the
// datasource URLs), so the wrapper refuses to run while any exists
// (findPrismaConfigProblems). This repo uses none.
//
// The guard checks the same DATABASE_URL and DIRECT_URL that Prisma will use:
// launch environment first, then .env, then prisma/.env (resolvePrismaEnv).
// Both must be set and pass. Prisma is then started with exactly that
// environment, so it cannot pick up a different value from a file.
import { spawnSync } from "node:child_process";

import {
  PROD_FLAG,
  enforceDatabaseWriteGuard,
  findPrismaConfigProblems,
  resolvePrismaEnv,
} from "./db-target-guard.mjs";

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

const SCHEMA_PATH = "prisma/schema.prisma";

const configProblems = findPrismaConfigProblems(process.cwd());
if (configProblems.length > 0) {
  console.error(
    [
      "Refusing to run prisma migrate deploy: Prisma configuration outside prisma/schema.prisma was found:",
      ...configProblems.map((problem) => `  - ${problem}`),
      "It can point Prisma at another schema or datasource, or stop it loading .env, so the guard's",
      "check would not match what Prisma connects to. Remove it, or update scripts/db-migrate.mjs",
      "and its tests to check it. Nothing was run.",
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

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["prisma", "migrate", "deploy", "--schema", SCHEMA_PATH],
  { stdio: "inherit", env }
);
process.exit(result.status ?? 1);
