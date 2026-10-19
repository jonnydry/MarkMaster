import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkDatabaseWrite,
  classifyDatabaseTarget,
  neonEndpointId,
  readGuardConfig,
  resolvePrismaEnv,
} from "./db-target-guard.mjs";

// Made-up endpoint ids and credentials. Real ids live only in local env.
const PROD_ID = "ep-proud-river-a1b2c3d4";
const DEV_ID = "ep-quiet-meadow-e5f6g7h8";
const OTHER_ID = "ep-lone-hill-z9y8x7w6";
const SECRET = "s3cr3t-pass";

const neon = (id: string, pooled = false) =>
  `postgresql://owner:${SECRET}@${id}${pooled ? "-pooler" : ""}.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require`;

const ENV = {
  MARKMASTER_PROD_ENDPOINT_ID: PROD_ID,
  MARKMASTER_DEV_ENDPOINT_IDS: DEV_ID,
};

function check(
  urls: Record<string, string | undefined>,
  env: Record<string, string | undefined> = ENV,
  argv: string[] = [],
  allowProdValue?: string
) {
  return checkDatabaseWrite({ urls, env, argv, allowProdValue, action: "test write" });
}

describe("neonEndpointId", () => {
  it("strips the pooler and compute binding suffixes", () => {
    expect(neonEndpointId(`${PROD_ID}.c-6.us-east-1.aws.neon.tech`)).toBe(PROD_ID);
    expect(neonEndpointId(`${PROD_ID}-pooler.c-6.us-east-1.aws.neon.tech`)).toBe(PROD_ID);
    expect(neonEndpointId(`${PROD_ID}-lym-pooler.c-6.us-east-1.aws.neon.tech`)).toBe(PROD_ID);
  });

  it("returns null for hosts that are not Neon", () => {
    expect(neonEndpointId("db.example.com")).toBeNull();
    expect(neonEndpointId(`${PROD_ID}.neon.tech.evil.com`)).toBeNull();
  });
});

describe("prod guard", () => {
  it("blocks the prod host", () => {
    const result = check({ DATABASE_URL: neon(PROD_ID, true), DIRECT_URL: neon(PROD_ID) });
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`DATABASE_URL points at the prod Neon endpoint ${PROD_ID}`);
    expect(result.message).toContain(`DIRECT_URL points at the prod Neon endpoint ${PROD_ID}`);
  });

  it("allows the prod host with --prod", () => {
    const result = check({ DATABASE_URL: neon(PROD_ID) }, ENV, ["--prod"]);
    expect(result.ok).toBe(true);
    expect(result.allowProd).toBe(true);
    expect(result.message).toContain("WARNING");
  });

  it("allows the prod host with MARKMASTER_ALLOW_PROD=1, and only with exactly 1", () => {
    expect(check({ DATABASE_URL: neon(PROD_ID) }, ENV, [], "1").ok).toBe(true);
    expect(check({ DATABASE_URL: neon(PROD_ID) }, ENV, [], "true").ok).toBe(false);
  });

  it("ignores MARKMASTER_ALLOW_PROD inside the resolved env; only the launch value counts", () => {
    const result = check({ DATABASE_URL: neon(PROD_ID) }, { ...ENV, MARKMASTER_ALLOW_PROD: "1" });
    expect(result.ok).toBe(false);
  });

  it("allows the dev host, pooled or direct", () => {
    const result = check({ DATABASE_URL: neon(DEV_ID, true), DIRECT_URL: neon(DEV_ID) });
    expect(result.ok).toBe(true);
    expect(result.allowProd).toBe(false);
  });

  it("allows a local database", () => {
    expect(check({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/markmaster" }, {}).ok).toBe(true);
    expect(check({ DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/markmaster" }, {}).ok).toBe(true);
  });

  it("blocks when one URL is dev and the other is prod", () => {
    const result = check({ DATABASE_URL: neon(DEV_ID, true), DIRECT_URL: neon(PROD_ID) });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("DIRECT_URL points at the prod");
  });

  describe("unknown hosts fail closed", () => {
    it("blocks a Neon endpoint that is neither prod nor listed as dev", () => {
      const result = check({ DATABASE_URL: neon(OTHER_ID) });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("not listed in MARKMASTER_DEV_ENDPOINT_IDS");
    });

    it("blocks every Neon endpoint, dev included, when the prod endpoint id is unset", () => {
      const result = check({ DATABASE_URL: neon(DEV_ID) }, { MARKMASTER_DEV_ENDPOINT_IDS: DEV_ID });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("MARKMASTER_PROD_ENDPOINT_ID is not set");
    });

    it("blocks a non-Neon remote host", () => {
      const result = check({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/markmaster" });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("neither local nor a Neon endpoint");
    });

    it("blocks an unparseable or missing URL", () => {
      expect(check({ DATABASE_URL: "not a url" }).ok).toBe(false);
      const missing = check({ DATABASE_URL: undefined, DIRECT_URL: "" });
      expect(missing.ok).toBe(false);
      expect(missing.message).toContain("DATABASE_URL and DIRECT_URL are not set");
    });

    it("blocks when one required URL is missing even if the other is dev", () => {
      const result = check({ DATABASE_URL: neon(DEV_ID, true), DIRECT_URL: undefined });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("DIRECT_URL is not set");
    });

    it("blocks ?hostaddr= on a local URL", () => {
      const result = check({ DATABASE_URL: "postgresql://u:p@localhost:5432/markmaster?hostaddr=10.0.0.5" });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("?hostaddr=");
    });

    it("blocks ?port= on a local URL", () => {
      const result = check({ DATABASE_URL: "postgresql://u:p@localhost:5432/markmaster?port=6543" });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("?port=");
    });

    it("blocks a URL that Prisma would expand with ${...}", () => {
      const result = check({ DATABASE_URL: "postgresql://u:p@localhost:5432/${DB_NAME}" });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("${...}");
    });

    it("blocks query parameters that retarget a local URL", () => {
      const result = check({
        DATABASE_URL: `postgresql://u:p@localhost:5432/markmaster?host=${PROD_ID}.c-6.us-east-1.aws.neon.tech`,
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("?host=");
    });

    it("blocks a dev host whose options=endpoint names another endpoint", () => {
      const url = `${neon(DEV_ID)}&options=endpoint%3D${PROD_ID}`;
      expect(check({ DATABASE_URL: url }).ok).toBe(false);
    });

    it("blocks when the dev list includes the prod endpoint", () => {
      const env = { MARKMASTER_PROD_ENDPOINT_ID: PROD_ID, MARKMASTER_DEV_ENDPOINT_IDS: `${DEV_ID},${PROD_ID}` };
      expect(readGuardConfig(env).configErrors).toHaveLength(1);
      expect(check({ DATABASE_URL: neon(DEV_ID) }, env).ok).toBe(false);
    });

    it("can still be overridden explicitly", () => {
      expect(check({ DATABASE_URL: neon(OTHER_ID) }, {}, ["--prod"]).ok).toBe(true);
    });
  });

  it("accepts a pasted hostname as the configured endpoint id", () => {
    const config = readGuardConfig({
      MARKMASTER_PROD_ENDPOINT_ID: `${PROD_ID}-pooler.c-6.us-east-1.aws.neon.tech`,
      MARKMASTER_DEV_ENDPOINT_IDS: ` ${DEV_ID} , `,
    });
    expect(config).toEqual({ prodEndpointId: PROD_ID, devEndpointIds: [DEV_ID], configErrors: [] });
    expect(classifyDatabaseTarget(neon(PROD_ID), config).kind).toBe("prod");
  });

  it("never echoes the password or full URL", () => {
    for (const result of [
      check({ DATABASE_URL: neon(PROD_ID) }),
      check({ DATABASE_URL: neon(PROD_ID) }, ENV, ["--prod"]),
      check({ DATABASE_URL: neon(DEV_ID) }),
      check({ DATABASE_URL: `postgresql://u:${SECRET}@db.example.com/x` }),
    ]) {
      expect(result.message).not.toContain(SECRET);
      expect(result.message).not.toContain("postgresql://");
    }
  });
});

const REPO = path.resolve(__dirname, "..");
const FAKE_PROD_URL = "postgresql://owner:" + SECRET + "@prod-target.invalid:5432/neondb";
// Nothing listens on port 1, so even a broken wrapper could not migrate it.
const UNREACHABLE_LOCAL_URL = "postgresql://postgres:postgres@localhost:1/markmaster";
const FAKE_LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/markmaster";

/** Temp project dir with optional .env and prisma/.env files. */
function tempProject(files: { env?: string; prismaEnv?: string }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-guard-"));
  if (files.env !== undefined) fs.writeFileSync(path.join(dir, ".env"), files.env);
  if (files.prismaEnv !== undefined) {
    fs.mkdirSync(path.join(dir, "prisma"));
    fs.writeFileSync(path.join(dir, "prisma", ".env"), files.prismaEnv);
  }
  return dir;
}

/** Run a script with a clean environment: PATH plus `env`, nothing inherited. */
function runScript(command: string, args: string[], cwd: string, env: Record<string, string>) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? "", ...env },
  });
}

function runMigrate(cwd: string, env: Record<string, string>, args: string[] = []) {
  return runScript(process.execPath, [path.join(REPO, "scripts/db-migrate.mjs"), ...args], cwd, env);
}

function expectRefused(result: ReturnType<typeof spawnSync>, text: string) {
  expect(result.status).toBe(1);
  expect(String(result.stderr)).toContain(text);
  expect(String(result.stdout)).not.toContain("Prisma schema loaded");
  expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
}

describe("resolvePrismaEnv", () => {
  it("prefers the launch env, then .env, then prisma/.env", () => {
    const dir = tempProject({
      env: "DIRECT_URL=from-root\nDATABASE_URL=from-root\n",
      prismaEnv: "DIRECT_URL=from-prisma\nSHADOW=from-prisma\n",
    });
    const { env } = resolvePrismaEnv({ cwd: dir, launchEnv: { DATABASE_URL: "from-launch" } });
    expect(env.DATABASE_URL).toBe("from-launch");
    expect(env.DIRECT_URL).toBe("from-root");
    expect(env.SHADOW).toBe("from-prisma");
  });
});

describe("db:migrate wrapper", { timeout: 60_000 }, () => {
  it("exits before Prisma runs when the target is prod", () => {
    const result = runMigrate(tempProject({}), {
      DATABASE_URL: neon(PROD_ID, true),
      DIRECT_URL: neon(PROD_ID),
      ...ENV,
    });
    expectRefused(result, "Refusing to run prisma migrate deploy");
  });

  it("checks a prod DIRECT_URL that only exists in .env", () => {
    const dir = tempProject({ env: `DIRECT_URL="${FAKE_PROD_URL}"\n` });
    const result = runMigrate(dir, { DATABASE_URL: FAKE_LOCAL_URL, DOTENV_CONFIG_PATH: "/nonexistent/.env" });
    expectRefused(result, "DIRECT_URL target prod-target.invalid");
  });

  it("checks a prod DIRECT_URL that only exists in prisma/.env", () => {
    const dir = tempProject({ prismaEnv: `DIRECT_URL="${FAKE_PROD_URL}"\n` });
    const result = runMigrate(dir, { DATABASE_URL: FAKE_LOCAL_URL });
    expectRefused(result, "DIRECT_URL target prod-target.invalid");
  });

  it("refuses when DIRECT_URL is not set anywhere", () => {
    const result = runMigrate(tempProject({}), { DATABASE_URL: FAKE_LOCAL_URL });
    expectRefused(result, "DIRECT_URL is not set");
  });

  it("refuses --schema, which could point Prisma at an unchecked datasource", () => {
    const dir = tempProject({});
    fs.mkdirSync(path.join(dir, "alt"));
    fs.writeFileSync(path.join(dir, "alt", ".env"), `ALT_DIRECT_URL="${FAKE_PROD_URL}"\n`);
    const result = runMigrate(
      dir,
      { DATABASE_URL: UNREACHABLE_LOCAL_URL, DIRECT_URL: UNREACHABLE_LOCAL_URL, MARKMASTER_DB_MIGRATE_DRY_RUN: "1" },
      ["--schema", "alt/schema.prisma"]
    );
    expectRefused(result, "unsupported arguments --schema alt/schema.prisma");
    expect(String(result.stdout)).not.toContain("Dry run");
  });

  it("refuses any other argument, even next to --prod", () => {
    const result = runMigrate(
      tempProject({}),
      { DATABASE_URL: UNREACHABLE_LOCAL_URL, DIRECT_URL: UNREACHABLE_LOCAL_URL, MARKMASTER_DB_MIGRATE_DRY_RUN: "1" },
      ["--prod", "--skip-generate"]
    );
    expectRefused(result, "unsupported argument --skip-generate");
    expect(String(result.stdout)).not.toContain("Dry run");
  });

  it("still accepts --prod for a prod target", () => {
    const result = runMigrate(
      tempProject({}),
      { DATABASE_URL: neon(PROD_ID, true), DIRECT_URL: neon(PROD_ID), ...ENV, MARKMASTER_DB_MIGRATE_DRY_RUN: "1" },
      ["--prod"]
    );
    expect(result.status).toBe(0);
    expect(String(result.stderr)).toContain("WARNING: prisma migrate deploy is running with the prod override");
    expect(String(result.stdout)).toContain("Dry run: checks passed");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  });

  it("does not accept MARKMASTER_ALLOW_PROD=1 from .env", () => {
    const dir = tempProject({ env: "MARKMASTER_ALLOW_PROD=1\n" });
    const result = runMigrate(dir, { DATABASE_URL: FAKE_PROD_URL, DIRECT_URL: FAKE_PROD_URL });
    expectRefused(result, "Refusing to run prisma migrate deploy");
  });
});

describe("other write scripts call the guard", { timeout: 60_000 }, () => {
  // A .invalid host, so a script whose guard call was removed fails on DNS
  // instead of reaching any real server.
  const prodEnv = {
    DATABASE_URL: FAKE_PROD_URL,
    ...ENV,
    DOTENV_CONFIG_PATH: "/nonexistent/.env",
  };

  it("embeddings:backfill refuses a prod URL", () => {
    const tsx = path.join(REPO, "node_modules/.bin/tsx");
    const result = runScript(
      tsx,
      ["--tsconfig", path.join(REPO, "tsconfig.json"), path.join(REPO, "scripts/backfill-bookmark-embeddings.ts")],
      tempProject({}),
      prodEnv
    );
    expectRefused(result, "Refusing to run embeddings:backfill");
  });

  it("embeddings:backfill ignores MARKMASTER_ALLOW_PROD=1 from .env", () => {
    const tsx = path.join(REPO, "node_modules/.bin/tsx");
    const { DOTENV_CONFIG_PATH: _unused, ...env } = prodEnv;
    void _unused;
    const result = runScript(
      tsx,
      ["--tsconfig", path.join(REPO, "tsconfig.json"), path.join(REPO, "scripts/backfill-bookmark-embeddings.ts")],
      tempProject({ env: "MARKMASTER_ALLOW_PROD=1\n" }),
      env
    );
    expectRefused(result, "Refusing to run embeddings:backfill");
  });

  it("merge-duplicate-gems --apply ignores MARKMASTER_ALLOW_PROD=1 from .env", () => {
    const { DOTENV_CONFIG_PATH: _unused, ...env } = prodEnv;
    void _unused;
    const result = runScript(
      process.execPath,
      [path.join(REPO, "scripts/merge-duplicate-gems.mjs"), "--apply"],
      tempProject({ env: "MARKMASTER_ALLOW_PROD=1\n" }),
      env
    );
    expectRefused(result, "Refusing to run merge-duplicate-gems --apply");
  });

  it("merge-duplicate-gems --apply refuses a prod URL", () => {
    const result = runScript(
      process.execPath,
      [path.join(REPO, "scripts/merge-duplicate-gems.mjs"), "--apply"],
      tempProject({}),
      prodEnv
    );
    expectRefused(result, "Refusing to run merge-duplicate-gems --apply");
  });
});
