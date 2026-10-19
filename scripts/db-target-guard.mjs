import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

/**
 * Prod guard for scripts that write to the database (migrations, the
 * embedding backfill, one-off data fixes).
 *
 * A write is allowed without a flag only when every URL the script uses is
 * either a local Postgres or a Neon endpoint listed as non-prod. Everything
 * else fails closed: the configured prod endpoint, an unknown Neon endpoint,
 * any other remote host, an unparseable URL, or a missing prod endpoint id.
 * `--prod` or MARKMASTER_ALLOW_PROD=1 lets the write through on purpose.
 * MARKMASTER_ALLOW_PROD is read from the environment the process was launched
 * with (captured when this module loads), so a value in .env never counts.
 * Import this module before anything that loads .env.
 *
 * The guard is only as accurate as MARKMASTER_PROD_ENDPOINT_ID and
 * MARKMASTER_DEV_ENDPOINT_IDS: if the prod id is wrong and the real prod id
 * is listed as dev, prod is treated as dev.
 *
 * Neon hostnames start with the compute endpoint id
 * (ep-adjective-noun-xxxxxxxx), optionally followed by "-pooler" or a
 * compute binding suffix. The endpoint id names one branch's compute, so it
 * tells prod and dev apart without reading any credential.
 *
 * Messages name hosts and endpoint ids only. They never echo a URL, user, or
 * password.
 */

export const ALLOW_PROD_ENV = "MARKMASTER_ALLOW_PROD";
export const PROD_ENDPOINT_ENV = "MARKMASTER_PROD_ENDPOINT_ID";
export const DEV_ENDPOINTS_ENV = "MARKMASTER_DEV_ENDPOINT_IDS";
export const PROD_FLAG = "--prod";

/** MARKMASTER_ALLOW_PROD as launched, before any .env file is loaded. */
export const LAUNCH_ALLOW_PROD = process.env[ALLOW_PROD_ENV];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ENDPOINT_ID = /^(ep-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+)(?:-[a-z0-9]+)*$/;
const RETARGET_PARAMS = ["host", "hostaddr", "port"];

/**
 * Neon endpoint id from a hostname, or null when it is not a Neon host.
 * "ep-a-b-c1d2e3f4-pooler.c-6.us-east-1.aws.neon.tech" -> "ep-a-b-c1d2e3f4"
 *
 * @param {string} hostname
 * @returns {string | null}
 */
export function neonEndpointId(hostname) {
  const host = hostname.toLowerCase();
  if (!host.endsWith(".neon.tech")) return null;
  const match = ENDPOINT_ID.exec(host.split(".")[0] ?? "");
  return match ? match[1] : null;
}

/**
 * Normalize a configured endpoint id (or a pasted hostname) to the bare id.
 *
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function normalizeEndpointId(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes(".")) return neonEndpointId(trimmed);
  const match = ENDPOINT_ID.exec(trimmed);
  return match ? match[1] : null;
}

/**
 * Endpoint id requested through Neon's `options=endpoint%3D<id>` parameter.
 *
 * @param {URLSearchParams} params
 * @returns {string | null}
 */
function optionsEndpointId(params) {
  const options = params.get("options");
  if (!options) return null;
  const match = /(?:^|\s)endpoint=([^\s]+)/i.exec(options);
  return match ? normalizeEndpointId(match[1]) : null;
}

/**
 * @typedef {{ prodEndpointId: string | null, devEndpointIds: string[], configErrors: string[] }} GuardConfig
 * @typedef {{ kind: "local" | "dev" | "prod" | "unknown", label: string, reason?: string }} TargetClass
 */

/**
 * Read guard settings from an environment object.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {GuardConfig}
 */
export function readGuardConfig(env) {
  const configErrors = [];
  const rawProd = env[PROD_ENDPOINT_ENV];
  const prodEndpointId = normalizeEndpointId(rawProd);
  if (rawProd?.trim() && !prodEndpointId) {
    configErrors.push(`${PROD_ENDPOINT_ENV} is not a Neon endpoint id (expected ep-...).`);
  }

  const devEndpointIds = [];
  for (const part of String(env[DEV_ENDPOINTS_ENV] ?? "").split(",")) {
    if (!part.trim()) continue;
    const id = normalizeEndpointId(part);
    if (!id) {
      configErrors.push(`${DEV_ENDPOINTS_ENV} has an entry that is not a Neon endpoint id (expected ep-...).`);
      continue;
    }
    devEndpointIds.push(id);
  }

  if (prodEndpointId && devEndpointIds.includes(prodEndpointId)) {
    configErrors.push(`${DEV_ENDPOINTS_ENV} lists the prod endpoint ${prodEndpointId}.`);
  }

  return { prodEndpointId, devEndpointIds, configErrors };
}

/**
 * Classify one connection URL. Pure: no network, no environment.
 *
 * @param {string | undefined} databaseUrl
 * @param {GuardConfig} config
 * @returns {TargetClass}
 */
export function classifyDatabaseTarget(databaseUrl, config) {
  let url;
  try {
    url = new URL(String(databaseUrl ?? ""));
  } catch {
    return { kind: "unknown", label: "(unparseable URL)", reason: "the URL could not be parsed" };
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    return { kind: "unknown", label: "(not a postgres URL)", reason: "the URL is not postgresql://" };
  }

  const hostname = url.hostname.toLowerCase();
  const label = hostname || "(empty host)";

  if (String(databaseUrl).includes("${")) {
    return { kind: "unknown", label, reason: "the URL contains ${...}, which Prisma expands from other variables" };
  }

  for (const param of RETARGET_PARAMS) {
    if (url.searchParams.has(param)) {
      return { kind: "unknown", label, reason: `the URL sets ?${param}=, which can point it at another server` };
    }
  }

  if (LOCAL_HOSTS.has(hostname)) {
    return { kind: "local", label };
  }

  const hostEndpoint = neonEndpointId(hostname);
  if (!hostEndpoint) {
    return { kind: "unknown", label, reason: "the host is neither local nor a Neon endpoint" };
  }

  const requested = optionsEndpointId(url.searchParams);
  if (requested && requested !== hostEndpoint) {
    return { kind: "unknown", label, reason: "options=endpoint names a different endpoint than the host" };
  }

  const endpointLabel = `Neon endpoint ${hostEndpoint}`;

  if (!config.prodEndpointId) {
    return {
      kind: "unknown",
      label: endpointLabel,
      reason: `${PROD_ENDPOINT_ENV} is not set, so prod cannot be ruled out`,
    };
  }

  if (hostEndpoint === config.prodEndpointId) {
    return { kind: "prod", label: endpointLabel };
  }

  if (config.devEndpointIds.includes(hostEndpoint)) {
    return { kind: "dev", label: endpointLabel };
  }

  return {
    kind: "unknown",
    label: endpointLabel,
    reason: `it is not the prod endpoint and not listed in ${DEV_ENDPOINTS_ENV}`,
  };
}

/**
 * Decide whether a write script may run against the given URLs.
 *
 * `allowProdValue` is MARKMASTER_ALLOW_PROD from the launch environment; it is
 * deliberately not read from `env`, which may include values from .env files.
 * Every key in `urls` is required: a missing or empty URL is refused, because
 * the tool that runs next may fill it from a file nobody checked.
 *
 * @param {{
 *   urls: Record<string, string | undefined>,
 *   env: Record<string, string | undefined>,
 *   argv?: readonly string[],
 *   allowProdValue?: string,
 *   action: string,
 * }} input
 * @returns {{ ok: boolean, allowProd: boolean, message: string }}
 */
export function checkDatabaseWrite({ urls, env, argv = [], allowProdValue, action }) {
  const allowProd = argv.includes(PROD_FLAG) || allowProdValue === "1";
  const config = readGuardConfig(env);
  const entries = Object.entries(urls).filter(([, value]) => value?.trim());
  const missing = Object.keys(urls).filter((key) => !urls[key]?.trim());

  const summary = entries
    .map(([key, value]) => {
      const target = classifyDatabaseTarget(value, config);
      return `  ${key}: ${target.label} (${target.kind})`;
    })
    .join("\n");

  if (allowProd) {
    return {
      ok: true,
      allowProd,
      message: [
        `WARNING: ${action} is running with the prod override (${PROD_FLAG} or ${ALLOW_PROD_ENV}=1).`,
        summary || "  (no database URL set)",
      ].join("\n"),
    };
  }

  const problems = [];
  if (missing.length > 0) {
    problems.push(`${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set, so the target cannot be checked`);
  }
  for (const error of config.configErrors) problems.push(error);

  for (const [key, value] of entries) {
    const target = classifyDatabaseTarget(value, config);
    if (target.kind === "prod") {
      problems.push(`${key} points at the prod ${target.label}`);
    } else if (target.kind === "unknown") {
      problems.push(`${key} target ${target.label} is not known to be non-prod: ${target.reason}`);
    }
  }

  if (problems.length > 0) {
    return {
      ok: false,
      allowProd,
      message: [
        `Refusing to run ${action}:`,
        ...problems.map((problem) => `  - ${problem}`),
        "",
        "Nothing was written. Point DATABASE_URL/DIRECT_URL at the dev branch (docs/SMART_SEARCH.md,",
        `"Two databases"), or, if you really mean prod, re-run with ${PROD_FLAG} or ${ALLOW_PROD_ENV}=1.`,
      ].join("\n"),
    };
  }

  return { ok: true, allowProd, message: `${action} target check passed:\n${summary}` };
}

/**
 * Resolve the environment the Prisma CLI will see when started from `cwd`:
 * the launch environment wins, then `<cwd>/.env`, then `<cwd>/prisma/.env`.
 * Prisma loads both files with dotenv without overriding variables that are
 * already set, so the first file to define a variable wins. Neither file
 * overrides the launch environment. DOTENV_CONFIG_PATH is ignored, as Prisma
 * ignores it.
 *
 * @param {{ cwd?: string, launchEnv?: Record<string, string | undefined> }} [options]
 * @returns {{ env: Record<string, string | undefined>, files: string[] }}
 */
export function resolvePrismaEnv({ cwd = process.cwd(), launchEnv = process.env } = {}) {
  const files = [];
  /** @type {Record<string, string | undefined>} */
  const env = {};
  for (const file of [path.join(cwd, "prisma", ".env"), path.join(cwd, ".env")]) {
    if (!fs.existsSync(file)) continue;
    files.unshift(path.relative(cwd, file));
    Object.assign(env, dotenv.parse(fs.readFileSync(file)));
  }
  for (const [key, value] of Object.entries(launchEnv)) {
    if (value !== undefined) env[key] = value;
  }
  return { env, files };
}

/**
 * Prisma config that could redirect `prisma migrate deploy` away from
 * prisma/schema.prisma and its env vars. Mirrors Prisma 6.19.3
 * (@prisma/config loadConfigFromFile -> c12 3.1.0 loadConfig with name
 * "prisma", cwd = process.cwd(), rcFile/packageJson/dotenv off):
 *
 * - the nearest package.json at or above `cwd` with a "prisma" key;
 * - `<cwd>/prisma.config`, `<cwd>/prisma.config.<ext>`, `<cwd>/prisma.config/index.<ext>`;
 * - `<cwd>/.config/prisma`, `.config/prisma.<ext>`, `.config/prisma/index.<ext>`;
 * - `<cwd>/.config/prisma.config`, `.config/prisma.config.<ext>`, `.config/prisma.config/index.<ext>`.
 *
 * Any name matching `prisma.config` (top level) or `prisma` (in .config),
 * followed by a dot or the end of the name, counts, whether file or folder.
 * Returns human-readable problems; empty means none found.
 *
 * @param {string} cwd
 * @returns {string[]}
 */
export function findPrismaConfigProblems(cwd) {
  const problems = [];

  let dir = path.resolve(cwd);
  for (;;) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const label = path.relative(cwd, pkgPath) || "package.json";
      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      } catch {
        problems.push(`${label} could not be read or parsed`);
      }
      if (pkg && typeof pkg === "object" && Object.hasOwn(pkg, "prisma")) {
        problems.push(`${label} has a "prisma" key`);
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const scan = [
    { dir: cwd, pattern: /^prisma\.config(\.|$)/i },
    { dir: path.join(cwd, ".config"), pattern: /^prisma(\.|$)/i },
  ];
  for (const { dir: scanDir, pattern } of scan) {
    let stat;
    try {
      stat = fs.statSync(scanDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      problems.push(`${path.relative(cwd, scanDir)} is not a directory, so it cannot be checked for Prisma config`);
      continue;
    }
    for (const name of fs.readdirSync(scanDir)) {
      if (pattern.test(name)) {
        problems.push(`${path.relative(cwd, path.join(scanDir, name)) || name} exists`);
      }
    }
  }

  return problems;
}

/**
 * CLI helper: print the decision and exit 1 when the write is refused.
 *
 * @param {{ urls: Record<string, string | undefined>, action: string, argv?: readonly string[], env?: Record<string, string | undefined>, allowProdValue?: string }} input
 */
export function enforceDatabaseWriteGuard({
  urls,
  action,
  argv = process.argv.slice(2),
  env = process.env,
  allowProdValue = LAUNCH_ALLOW_PROD,
}) {
  const decision = checkDatabaseWrite({ urls, env, argv, allowProdValue, action });
  if (!decision.ok) {
    console.error(decision.message);
    process.exit(1);
  }
  if (decision.allowProd) {
    console.warn(decision.message);
  } else {
    console.log(decision.message);
  }
  return decision;
}
