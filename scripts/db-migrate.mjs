// `npm run db:migrate`: prisma migrate deploy behind the prod guard.
// Usage: npm run db:migrate [-- --prod]   (or MARKMASTER_ALLOW_PROD=1 in the shell)
//
// The guard checks the same DATABASE_URL and DIRECT_URL that Prisma will use:
// launch environment first, then .env, then prisma/.env (resolvePrismaEnv).
// Both must be set and pass. Prisma is then started with exactly that
// environment, so it cannot pick up a different value from a file.
import { spawnSync } from "node:child_process";

import { PROD_FLAG, enforceDatabaseWriteGuard, resolvePrismaEnv } from "./db-target-guard.mjs";

const argv = process.argv.slice(2);
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
  ["prisma", "migrate", "deploy", ...argv.filter((arg) => arg !== PROD_FLAG)],
  { stdio: "inherit", env }
);
process.exit(result.status ?? 1);
