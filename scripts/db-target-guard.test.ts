import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  checkDatabaseWrite,
  classifyDatabaseTarget,
  neonEndpointId,
  readGuardConfig,
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
  argv: string[] = []
) {
  return checkDatabaseWrite({ urls, env, argv, action: "test write" });
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
    expect(check({ DATABASE_URL: neon(PROD_ID) }, { ...ENV, MARKMASTER_ALLOW_PROD: "1" }).ok).toBe(true);
    expect(check({ DATABASE_URL: neon(PROD_ID) }, { ...ENV, MARKMASTER_ALLOW_PROD: "true" }).ok).toBe(false);
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
      expect(missing.message).toContain("no database URL is set");
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

describe("db:migrate wrapper", () => {
  it("exits before Prisma runs when the target is prod", () => {
    const result = spawnSync(process.execPath, ["scripts/db-migrate.mjs"], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        DOTENV_CONFIG_PATH: "/nonexistent/.env",
        DATABASE_URL: neon(PROD_ID, true),
        DIRECT_URL: neon(PROD_ID),
        ...ENV,
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to run prisma migrate deploy");
    expect(result.stdout).not.toContain("Prisma");
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  });
});
