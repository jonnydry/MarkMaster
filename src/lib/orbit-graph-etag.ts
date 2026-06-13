import { createHash } from "node:crypto";

export function buildOrbitGraphETag(input: {
  cacheVersion: number;
  scope: string;
  nodeCap: number;
  expandKey: string;
  generatedAt: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        input.cacheVersion,
        input.scope,
        input.nodeCap,
        input.expandKey,
        input.generatedAt,
      ].join("|")
    )
    .digest("hex")
    .slice(0, 16);

  return `W/"orbit-graph-${digest}"`;
}
