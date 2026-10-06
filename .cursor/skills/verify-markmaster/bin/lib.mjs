#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "@auth/core/jwt";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(SKILL_DIR, "../../..");
export const RUNS_DIR = path.join(tmpdir(), "markmaster-verify");
export const STATE_PATH = path.join(RUNS_DIR, "current", "state.json");

export const APP_PORT = Number(process.env.VERIFY_APP_PORT || 3100);
export const PG_PORT = Number(process.env.VERIFY_PG_PORT || 54329);
export const DB_NAME = "markmaster_verify";
export const DB_USER = "user";
export const DB_PASSWORD = "password";
export const SESSION_MAX_AGE = 14 * 24 * 60 * 60;
export const COOKIE_NAME = "authjs.session-token";
export const CHUNK_SIZE = 3936;
export const TWITTER_ID = "verify-not-a-real-client";
export const TWITTER_SECRET = "verify-not-a-real-secret";

export const BLOCKED_HOSTS = [
  "api.x.com",
  "api.twitter.com",
  "x.com",
  "twitter.com",
  "api.x.ai",
  "api.typesafe.ai",
  "typesafe.ai",
];

export function appOrigin(port = APP_PORT) {
  return `http://127.0.0.1:${port}`;
}

export function databaseUrl(port = PG_PORT) {
  return `postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${port}/${DB_NAME}`;
}

export function readState() {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

export function writeState(state) {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

export function runIdNow() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

export function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

export function childEnv(state) {
  const env = { ...process.env };
  for (const key of [
    "XAI_API_KEY",
    "XAI_API_BASE_URL",
    "XAI_ORBIT_MODEL",
    "TYPESAFE_API_KEY",
    "TYPESAFE_DEFAULT_MODEL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]) {
    env[key] = "";
  }
  env.DATABASE_URL = state.databaseUrl;
  env.DIRECT_URL = state.databaseUrl;
  env.VERIFY_MARKMASTER = "1";
  env.AUTH_SECRET = state.authSecret;
  env.AUTH_URL = state.appOrigin;
  env.NEXTAUTH_URL = state.appOrigin;
  env.APP_URL = state.appOrigin;
  env.NEXT_PUBLIC_APP_URL = state.appOrigin;
  env.CRON_SECRET = "";
  env.SYNC_WORKER_SECRET = "";
  env.OWNER_USER_ID = "";
  env.AUTH_TWITTER_ID = TWITTER_ID;
  env.AUTH_TWITTER_SECRET = TWITTER_SECRET;
  env.ENCRYPTION_KEY = state.encryptionKey;
  env.NODE_ENV = "development";
  return env;
}

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function killProcessGroup(pid) {
  if (!pid || !pidAlive(pid)) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

export function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export function findPostgresBin() {
  const versions = ["17", "16", "15"];
  for (const version of versions) {
    const dir = `/usr/lib/postgresql/${version}/bin`;
    if (existsSync(path.join(dir, "initdb"))) return dir;
  }
  return null;
}

export function commandExists(name) {
  const result = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return result.status === 0 && Boolean(result.stdout?.trim());
}

export function runSync(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
  });
}

export function chunkCookie(value, name = COOKIE_NAME) {
  if (value.length <= CHUNK_SIZE) return [{ name, value }];
  const chunks = [];
  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i += 1) {
    chunks.push({
      name: `${name}.${i}`,
      value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
  return chunks;
}

export async function mintSession(state, user) {
  const token = await encode({
    token: {
      sub: user.id,
      name: user.displayName,
      dbUser: {
        id: user.id,
        xId: user.xId,
        username: user.username,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl,
        lastSyncAt: user.lastSyncAt,
        syncXFolders: user.syncXFolders,
      },
      sessionVersion: user.sessionVersion,
      sessionValidatedAt: Date.now(),
      xId: user.xId,
      username: user.username,
    },
    secret: state.authSecret,
    salt: COOKIE_NAME,
    maxAge: SESSION_MAX_AGE,
  });
  return chunkCookie(token);
}

export function seedUser(state) {
  const result = runSync("node", ["scripts/seed-verify.mjs"], {
    env: childEnv(state),
  });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(detail || "seed-verify failed");
  }
  const line = result.stdout.trim().split("\n").at(-1);
  return JSON.parse(line);
}

export async function refreshFixture(state) {
  const user = seedUser(state);
  const sessionCookies = await mintSession(state, user);
  const next = { ...state, userId: user.id, sessionCookies };
  writeState(next);
  return next;
}

export function spawnLogged(cmd, args, { env, logPath, cwd }) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, "a");
  const child = spawn(cmd, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  return child.pid;
}

export async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}. Last result: ${last}`);
}

export function postgresReadyArgs(state) {
  if (state.pg.kind === "docker") {
    return ["docker", ["exec", state.pg.containerName, "pg_isready", "-U", DB_USER, "-d", "postgres"]];
  }
  const bin = state.pg.bin;
  return [
    path.join(bin, "pg_isready"),
    ["-h", "127.0.0.1", "-p", String(state.pgPort), "-U", DB_USER],
  ];
}

export async function waitForPostgres(state, timeoutMs = 30_000) {
  const started = Date.now();
  const [cmd, args] = postgresReadyArgs(state);
  while (Date.now() - started < timeoutMs) {
    const result = runSync(cmd, args);
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Postgres on 127.0.0.1:${state.pgPort} did not become ready.`);
}

export function evidenceStillPresent(state) {
  return existsSync(path.join(state.evidenceDir, "summary.json"));
}
