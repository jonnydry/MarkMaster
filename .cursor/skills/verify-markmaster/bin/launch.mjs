#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  APP_PORT,
  DB_NAME,
  DB_USER,
  PG_PORT,
  REPO_ROOT,
  RUNS_DIR,
  appOrigin,
  childEnv,
  commandExists,
  databaseUrl,
  findPostgresBin,
  pidAlive,
  portOpen,
  randomHex,
  readState,
  refreshFixture,
  runIdNow,
  runSync,
  spawnLogged,
  waitForHttp,
  waitForPostgres,
  writeState,
} from "./lib.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const existing = readState();
if (existing && !existing.stopped && pidAlive(existing.nextPid)) {
  fail(
    `A verify instance is already running at ${existing.appOrigin} (pid ${existing.nextPid}).\n` +
      "Drive that instance, or run cleanup before launch.\n" +
      "Fix: node .cursor/skills/verify-markmaster/bin/cleanup.mjs"
  );
}

if (await portOpen(APP_PORT)) {
  fail(
    `127.0.0.1:${APP_PORT} is already in use by another process.\n` +
      "Verification will not share an app port.\n" +
      `Fix: stop the process on ${APP_PORT}, or set VERIFY_APP_PORT to a free port and launch again.`
  );
}

if (await portOpen(PG_PORT)) {
  fail(
    `127.0.0.1:${PG_PORT} is already in use by another Postgres.\n` +
      "Verification will not share a database server.\n" +
      `Fix: stop that server, run cleanup if it is a leftover verify cluster, or set VERIFY_PG_PORT.`
  );
}

const runId = runIdNow();
const runDir = path.join(RUNS_DIR, runId);
const evidenceDir = path.join(runDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const state = {
  runId,
  stopped: false,
  appPort: APP_PORT,
  appOrigin: appOrigin(APP_PORT),
  pgPort: PG_PORT,
  databaseUrl: databaseUrl(PG_PORT),
  authSecret: randomHex(32),
  encryptionKey: randomHex(32),
  nextPid: null,
  nextLog: path.join(runDir, "next.log"),
  pg: null,
  userId: null,
  sessionCookies: [],
  evidenceDir,
  runDir,
};

console.log(`Starting Postgres for ${DB_NAME} on 127.0.0.1:${PG_PORT}`);
state.pg = startPostgres(runDir);
writeState(state);

try {
  await waitForPostgres(state);
  createDatabase(state);
  console.log("Applying migrations");
  const migrated = runSync("npx", ["--no-install", "prisma", "migrate", "deploy"], {
    env: childEnv(state),
  });
  if (migrated.status !== 0) {
    throw new Error(`${migrated.stdout ?? ""}${migrated.stderr ?? ""}`.trim());
  }
  console.log("Seeding the verify user");
  await refreshFixture(state);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error("Launch failed after Postgres started. Run cleanup so the port is released.");
  console.error("Fix: node .cursor/skills/verify-markmaster/bin/cleanup.mjs");
  process.exit(1);
}

console.log(`Starting Next.js at ${state.appOrigin}`);
const nextPid = spawnLogged(
  "npm",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(state.appPort)],
  { cwd: REPO_ROOT, env: childEnv(readState()), logPath: state.nextLog }
);
const started = readState();
started.nextPid = nextPid;
writeState(started);

try {
  await waitForHttp(`${started.appOrigin}/login`, 180_000);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(`Next.js log: ${started.nextLog}`);
  console.error("Fix: node .cursor/skills/verify-markmaster/bin/cleanup.mjs");
  process.exit(1);
}

console.log(`Ready ${started.appOrigin}`);
console.log(`Evidence directory: ${started.evidenceDir}`);
console.log(`State: ${path.join(RUNS_DIR, "current", "state.json")}`);

function startPostgres(runDir) {
  if (commandExists("docker")) {
    const name = `markmaster-verify-pg-${runId.toLowerCase()}`;
    const result = runSync("docker", [
      "run",
      "-d",
      "--name",
      name,
      "--label",
      "markmaster-verify=1",
      "-e",
      `POSTGRES_USER=${DB_USER}`,
      "-e",
      "POSTGRES_PASSWORD=password",
      "-e",
      `POSTGRES_DB=${DB_NAME}`,
      "-p",
      `127.0.0.1:${PG_PORT}:5432`,
      "postgres:16-alpine",
    ]);
    if (result.status !== 0) {
      throw new Error(result.stderr || "docker run failed");
    }
    const containerId = (result.stdout || "").trim();
    return { kind: "docker", containerId, containerName: name };
  }

  const bin = findPostgresBin();
  if (!bin) {
    throw new Error(
      "Docker is not installed and initdb was not found.\n" +
        "Fix: install Docker, or install PostgreSQL 16 so initdb is on the machine."
    );
  }

  const dataDir = path.join(runDir, "pgdata");
  const sockDir = path.join(runDir, "pgsock");
  mkdirSync(sockDir, { recursive: true });
  const init = runSync(path.join(bin, "initdb"), [
    "-D",
    dataDir,
    "--username",
    DB_USER,
    "--auth=trust",
    "--no-instructions",
  ]);
  if (init.status !== 0) {
    throw new Error(`${init.stdout ?? ""}${init.stderr ?? ""}`.trim() || "initdb failed");
  }

  const pid = spawnLogged(
    path.join(bin, "postgres"),
    [
      "-D",
      dataDir,
      "-p",
      String(PG_PORT),
      "-c",
      "listen_addresses=127.0.0.1",
      "-c",
      `unix_socket_directories=${sockDir}`,
    ],
    { cwd: runDir, env: process.env, logPath: path.join(runDir, "pg.log") }
  );
  return { kind: "pg_ctl", bin, dataDir, pid };
}

function createDatabase(current) {
  if (current.pg.kind === "docker") return;
  const created = runSync(path.join(current.pg.bin, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(current.pgPort),
    "-U",
    DB_USER,
    DB_NAME,
  ]);
  if (created.status !== 0) {
    const detail = `${created.stdout ?? ""}${created.stderr ?? ""}`;
    if (!detail.includes("already exists")) {
      throw new Error(detail.trim() || "createdb failed");
    }
  }
}
