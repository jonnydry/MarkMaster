// `npm run db:migrate`: prisma migrate deploy behind the prod guard.
// Usage: npm run db:migrate [-- --prod]   (or MARKMASTER_ALLOW_PROD=1)
import "dotenv/config";
import { spawnSync } from "node:child_process";

import { PROD_FLAG, enforceDatabaseWriteGuard } from "./db-target-guard.mjs";

const argv = process.argv.slice(2);
enforceDatabaseWriteGuard({
  action: "prisma migrate deploy",
  urls: { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL },
  argv,
});

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["prisma", "migrate", "deploy", ...argv.filter((arg) => arg !== PROD_FLAG)],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
