#!/usr/bin/env node
import { rmSync } from "node:fs";
import path from "node:path";
import {
  DB_NAME,
  DB_USER,
  evidenceStillPresent,
  killProcessGroup,
  pidAlive,
  readState,
  runSync,
  writeState,
} from "./lib.mjs";

const state = readState();
if (!state) {
  console.log("No verify state file. Nothing to stop.");
  process.exit(0);
}

const evidenceBefore = evidenceStillPresent(state);

if (state.nextPid) {
  console.log(`Stopping Next.js pid ${state.nextPid}`);
  killProcessGroup(state.nextPid);
}

dropDatabase(state);
stopPostgres(state);

state.stopped = true;
state.nextPid = null;
if (state.pg) state.pg.pid = null;
writeState(state);

if (evidenceBefore && !evidenceStillPresent(state)) {
  console.error(`Cleanup removed evidence at ${state.evidenceDir}`);
  process.exit(1);
}

console.log(`Stopped the verify instance for run ${state.runId}.`);
if (evidenceBefore) {
  console.log(`Evidence kept at ${state.evidenceDir}`);
} else {
  console.log("No evidence summary was present. Nothing to preserve.");
}

function dropDatabase(current) {
  if (current.pg?.kind === "docker" && current.pg.containerName) {
    const dropped = runSync("docker", [
      "exec",
      current.pg.containerName,
      "dropdb",
      "-U",
      DB_USER,
      "--if-exists",
      DB_NAME,
    ]);
    if (dropped.status !== 0) {
      console.error((dropped.stderr || dropped.stdout || "").trim());
    } else {
      console.log(`Dropped database ${DB_NAME}`);
    }
    return;
  }

  if (current.pg?.kind === "pg_ctl" && current.pg.bin && pidAlive(current.pg.pid)) {
    const dropped = runSync(path.join(current.pg.bin, "dropdb"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(current.pgPort),
      "-U",
      DB_USER,
      "--if-exists",
      DB_NAME,
    ]);
    if (dropped.status !== 0) {
      console.error((dropped.stderr || dropped.stdout || "").trim());
    } else {
      console.log(`Dropped database ${DB_NAME}`);
    }
  }
}

function stopPostgres(current) {
  if (!current.pg) return;

  if (current.pg.kind === "docker") {
    const inspected = runSync("docker", [
      "inspect",
      "-f",
      "{{index .Config.Labels \"markmaster-verify\"}}",
      current.pg.containerName,
    ]);
    const label = (inspected.stdout || "").trim();
    if (inspected.status !== 0 || label !== "1") {
      console.error(
        `Refusing to remove container ${current.pg.containerName}. It is missing the markmaster-verify label.`
      );
      return;
    }
    const removed = runSync("docker", ["rm", "-f", current.pg.containerName]);
    if (removed.status !== 0) {
      console.error((removed.stderr || "").trim());
      return;
    }
    console.log(`Removed container ${current.pg.containerName}`);
    return;
  }

  if (current.pg.pid) {
    console.log(`Stopping Postgres pid ${current.pg.pid}`);
    killProcessGroup(current.pg.pid);
  }
  if (current.pg.dataDir) {
    rmSync(current.pg.dataDir, { recursive: true, force: true });
    console.log(`Removed Postgres data directory ${current.pg.dataDir}`);
  }
}
