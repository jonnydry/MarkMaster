// `npm run db:migrate`: prisma migrate deploy behind the prod guard.
// Usage: npm run db:migrate [-- --prod]   (or MARKMASTER_ALLOW_PROD=1 in the shell)
// No other arguments are accepted, and Prisma always gets
// --schema prisma/schema.prisma, so the schema and its datasource env vars are
// the ones the guard checked. A package.json "prisma" key or a prisma.config.*
// file could also redirect Prisma (and a config file turns off its .env
// loading), so the wrapper refuses to run while either exists. This repo uses
// neither.
//
// The guard checks the same DATABASE_URL and DIRECT_URL that Prisma will use:
// launch environment first, then .env, then prisma/.env (resolvePrismaEnv).
// Both must be set and pass. Prisma is then started with exactly that
// environment, so it cannot pick up a different value from a file.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

const SCHEMA_PATH = "prisma/schema.prisma";

const cwd = process.cwd();
const configProblems = [];
const pkgPath = path.join(cwd, "package.json");
if (fs.existsSync(pkgPath)) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    configProblems.push("package.json could not be parsed");
  }
  if (pkg && typeof pkg === "object" && Object.hasOwn(pkg, "prisma")) {
    configProblems.push('package.json has a "prisma" key');
  }
}
for (const dir of [cwd, path.join(cwd, ".config")]) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (/^prisma\.config\./.test(name) || (dir !== cwd && /^prisma\./.test(name))) {
      configProblems.push(`${path.relative(cwd, path.join(dir, name))} exists`);
    }
  }
}
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
