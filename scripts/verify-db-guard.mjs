/**
 * Decide whether a seed is allowed to open a database.
 * Pure: it does not connect, and it does not read the process environment.
 *
 * @param {string | undefined} databaseUrl
 * @param {string | undefined} verifyFlag
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function assertVerifyDatabase(databaseUrl, verifyFlag) {
  let url;
  try {
    url = new URL(String(databaseUrl));
  } catch {
    return {
      ok: false,
      message:
        "Refusing to seed: DATABASE_URL is not a parseable URL. Only postgresql://127.0.0.1:<port>/markmaster_verify or the same URL with host localhost is allowed.",
    };
  }

  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    return {
      ok: false,
      message: `Refusing to seed: DATABASE_URL host is ${url.hostname || "(empty)"}. Only 127.0.0.1 and localhost are allowed.`,
    };
  }

  if (url.pathname !== "/markmaster_verify") {
    return {
      ok: false,
      message: `Refusing to seed: DATABASE_URL database is ${url.pathname || "(empty)"}. Only /markmaster_verify is allowed.`,
    };
  }

  if (verifyFlag !== "1") {
    return {
      ok: false,
      message: "Refusing to seed: set VERIFY_MARKMASTER=1. Without that flag this script does not run.",
    };
  }

  return { ok: true };
}
