// Prisma config detection for `npm run db:migrate`.
// This module imports only node: builtins, so the wrapper can run it before
// loading anything that needs a bare-specifier import. Node resolves bare
// imports through the nearest package.json, and an unparseable one throws
// ERR_INVALID_PACKAGE_CONFIG before any check could report it cleanly.
import fs from "node:fs";
import path from "node:path";

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
