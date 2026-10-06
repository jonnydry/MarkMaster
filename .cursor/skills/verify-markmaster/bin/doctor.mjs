#!/usr/bin/env node
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { decode } from "@auth/core/jwt";
import {
  COOKIE_NAME,
  DB_NAME,
  REPO_ROOT,
  TWITTER_ID,
  TWITTER_SECRET,
  childEnv,
  pidAlive,
  portOpen,
  readState,
  runSync,
} from "./lib.mjs";
import { VERIFY_USERNAME, VERIFY_XID } from "../../../../scripts/verify-fixture.mjs";
import { assertVerifyDatabase } from "../../../../scripts/verify-db-guard.mjs";

const problems = [];

function problem(title, fix) {
  problems.push({ title, fix });
}

const state = readState();
if (!state) {
  problem(
    "No verify state file.",
    "node .cursor/skills/verify-markmaster/bin/launch.mjs"
  );
  report();
}

if (state.stopped) {
  problem(
    `Run ${state.runId} is stopped.`,
    "node .cursor/skills/verify-markmaster/bin/launch.mjs"
  );
}

if (!pidAlive(state.nextPid)) {
  problem(
    `Next.js pid ${state.nextPid ?? "(missing)"} is not running.`,
    "node .cursor/skills/verify-markmaster/bin/cleanup.mjs && node .cursor/skills/verify-markmaster/bin/launch.mjs"
  );
} else if (!(await portOpen(state.appPort))) {
  problem(
    `Nothing is listening on 127.0.0.1:${state.appPort}.`,
    "Read the Next.js log at " + state.nextLog + " and launch again after cleanup."
  );
} else {
  const listener = listenerPid(state.appPort);
  if (listener && !isDescendant(state.nextPid, listener) && listener !== state.nextPid) {
    problem(
      `Port ${state.appPort} is owned by pid ${listener}, not the verify Next.js pid ${state.nextPid}.`,
      "Stop that process or choose another VERIFY_APP_PORT. Do not drive a shared server."
    );
  }
}

const databaseGuard = assertVerifyDatabase(state.databaseUrl, "1");
if (!databaseGuard.ok) {
  problem(
    databaseGuard.message,
    "Delete the state file and launch again. Do not point verification at a shared database."
  );
}

if (state.pg?.kind === "pg_ctl" && !pidAlive(state.pg.pid)) {
  problem(
    `Postgres pid ${state.pg.pid ?? "(missing)"} is not running.`,
    "node .cursor/skills/verify-markmaster/bin/cleanup.mjs && node .cursor/skills/verify-markmaster/bin/launch.mjs"
  );
}

if (pidAlive(state.nextPid)) {
  const env = readProcessEnv(state.nextPid);
  if (env.DATABASE_URL !== state.databaseUrl) {
    problem(
      "The running Next.js process is using a different DATABASE_URL.",
      "Cleanup and launch so the app and the state file match."
    );
  }
  if (!env.AUTH_SECRET || env.AUTH_SECRET !== state.authSecret) {
    problem(
      "The running Next.js process does not have this run's AUTH_SECRET.",
      "Cleanup and launch so the session cookie matches the server."
    );
  }
  if (env.AUTH_TWITTER_ID !== TWITTER_ID || env.AUTH_TWITTER_SECRET !== TWITTER_SECRET) {
    problem(
      "AUTH_TWITTER_ID or AUTH_TWITTER_SECRET is not the verify placeholder.",
      "Cleanup and launch. Verification must not use a real X client."
    );
  }
  if (env.XAI_API_KEY?.trim() || env.TYPESAFE_API_KEY?.trim()) {
    problem(
      "XAI_API_KEY or TYPESAFE_API_KEY is set on the running server.",
      "Unset both and launch again. Verification must not call xAI or TypeSafe."
    );
  }
  if (env.VERIFY_MARKMASTER !== "1") {
    problem(
      "VERIFY_MARKMASTER is not 1 on the running server.",
      "Cleanup and launch. The seed refuses to run without that flag."
    );
  }
  if (env.APP_URL !== state.appOrigin || env.NEXT_PUBLIC_APP_URL !== state.appOrigin) {
    problem(
      "APP_URL or NEXT_PUBLIC_APP_URL does not match this run.",
      "Cleanup and launch so share links stay on the verify origin."
    );
  }
  if (env.CRON_SECRET?.trim() || env.SYNC_WORKER_SECRET?.trim() || env.OWNER_USER_ID?.trim()) {
    problem(
      "CRON_SECRET, SYNC_WORKER_SECRET, or OWNER_USER_ID is set on the running server.",
      "Cleanup and launch. Verification sets those to empty so a developer environment cannot authorize workers."
    );
  }
}

if (state.databaseUrl?.includes(DB_NAME) && (state.pg?.kind !== "pg_ctl" || pidAlive(state.pg?.pid))) {
  const status = runSync("npx", ["--no-install", "prisma", "migrate", "status"], {
    cwd: REPO_ROOT,
    env: childEnv(state),
  });
  if (status.status !== 0) {
    problem(
      "Migrations are not up to date on markmaster_verify.",
      "With the verify DATABASE_URL and DIRECT_URL exported, run: npx prisma migrate deploy"
    );
  }
}

let prisma;
try {
  process.env.DATABASE_URL = state.databaseUrl;
  process.env.DIRECT_URL = state.databaseUrl;
  prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { xId: VERIFY_XID } });
  if (!user) {
    problem(
      "The verify user is not in the database.",
      "node scripts/seed-verify.mjs with VERIFY_MARKMASTER=1 and the verify DATABASE_URL and ENCRYPTION_KEY. Launch sets those."
    );
  } else if (user.id !== state.userId) {
    problem(
      "The seeded user id does not match the state file.",
      "Launch again so the session is minted for the current row."
    );
  }
} catch (error) {
  problem(
    `Database check failed: ${error instanceof Error ? error.message : error}`,
    "Confirm Postgres is up, then run launch again."
  );
} finally {
  await prisma?.$disconnect();
}

if (state.sessionCookies?.length && state.authSecret) {
  const joined = joinSessionCookie(state.sessionCookies);
  try {
    const token = await decode({
      token: joined,
      secret: state.authSecret,
      salt: COOKIE_NAME,
    });
    const dbUser = token?.dbUser;
    if (!dbUser || dbUser.username !== VERIFY_USERNAME || dbUser.id !== state.userId) {
      problem(
        "The session cookie does not decode to the verify user.",
        "Launch again to mint a new cookie with this run's AUTH_SECRET."
      );
    }
  } catch (error) {
    problem(
      `The session cookie did not decrypt: ${error instanceof Error ? error.message : error}`,
      "Launch again. The cookie salt must stay authjs.session-token."
    );
  }
} else {
  problem(
    "State has no session cookie.",
    "Launch again so it can mint a session after seeding."
  );
}

if (problems.length === 0 && pidAlive(state.nextPid)) {
  const cookie = state.sessionCookies.map((item) => `${item.name}=${item.value}`).join("; ");
  try {
    const login = await fetch(`${state.appOrigin}/login`);
    if (login.status !== 200) {
      problem(
        `/login returned HTTP ${login.status}.`,
        `Read ${state.nextLog} and launch again.`
      );
    }
    const session = await fetch(`${state.appOrigin}/api/auth/session`, {
      headers: { cookie },
    });
    const body = await session.json().catch(() => null);
    if (session.status !== 200 || body?.dbUser?.username !== VERIFY_USERNAME) {
      problem(
        "GET /api/auth/session did not return the verify user.",
        "Cleanup and launch so the cookie, AUTH_SECRET, and database row match."
      );
    }
  } catch (error) {
    problem(
      `HTTP check failed: ${error instanceof Error ? error.message : error}`,
      "Confirm the app port and launch again."
    );
  }
}

report();

function report() {
  if (problems.length === 0) {
    console.log(`OK ${state.appOrigin}`);
    console.log(`Database ${DB_NAME} on 127.0.0.1:${state.pgPort}`);
    console.log(`User ${VERIFY_USERNAME} (${state.userId})`);
    console.log("Migrations are up to date. Session cookie decrypts. External API keys are empty.");
    process.exit(0);
  }
  console.error(`Doctor found ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
  for (const item of problems) {
    console.error(`\n${item.title}`);
    console.error(`Fix: ${item.fix}`);
  }
  process.exit(1);
}

function readProcessEnv(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/environ`);
    const env = {};
    for (const part of raw.toString("utf8").split("\0")) {
      const index = part.indexOf("=");
      if (index > 0) env[part.slice(0, index)] = part.slice(index + 1);
    }
    return env;
  } catch {
    return {};
  }
}

function listenerPid(port) {
  const fromSs = listenerPidFromSs(port);
  if (fromSs) return fromSs;
  return listenerPidFromProc(port);
}

function listenerPidFromSs(port) {
  const result = runSync("ss", ["-ltnp"]);
  if (result.status !== 0 || !result.stdout) return null;
  const needle = `:${port}`;
  for (const line of result.stdout.split("\n")) {
    if (!line.includes(needle)) continue;
    const match = line.match(/pid=(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

function listenerPidFromProc(port) {
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  let inode = null;
  let table = "";
  try {
    table = readFileSync("/proc/net/tcp", "utf8");
  } catch {
    return null;
  }
  for (const line of table.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10 || parts[3] !== "0A") continue;
    const localPort = parts[1]?.split(":")[1]?.toUpperCase();
    if (localPort === hex) {
      inode = parts[9];
      break;
    }
  }
  if (!inode) return null;
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    let fds = [];
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (readlinkSync(`/proc/${pid}/fd/${fd}`) === `socket:[${inode}]`) {
          return Number(pid);
        }
      } catch {
        /* fd vanished */
      }
    }
  }
  return null;
}

function isDescendant(ancestor, pid) {
  let current = pid;
  for (let i = 0; i < 12; i += 1) {
    if (current === ancestor) return true;
    try {
      const stat = readFileSync(`/proc/${current}/stat`, "utf8");
      const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      if (!parent || parent === current) return false;
      current = parent;
    } catch {
      return false;
    }
  }
  return false;
}

function joinSessionCookie(cookies) {
  const single = cookies.find((item) => item.name === COOKIE_NAME);
  if (single) return single.value;
  return cookies
    .filter((item) => item.name.startsWith(`${COOKIE_NAME}.`))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => item.value)
    .join("");
}
