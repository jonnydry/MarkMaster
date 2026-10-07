import "server-only";

import {
  ORBIT_LABEL_EXAMPLES_PER_LABEL,
  ORBIT_LABEL_EXAMPLE_MAX_CHARS,
} from "@/lib/orbit-config";
import { normalizeTagKey } from "@/lib/orbit-grok-normalize";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * A tag's name alone is ambiguous (Rust, Go, Swift, Design). The posts a user
 * already filed under it say what it means in this library, so Jev is shown a
 * couple of them beside the name.
 */

/** Posts shorter than this after links are stripped say too little to define a label. */
const MIN_EXAMPLE_CHARS = 16;

/** Rows read per label; extra rows cover posts that are too short once cleaned. */
const ROWS_PER_LABEL = ORBIT_LABEL_EXAMPLES_PER_LABEL * 2;

export function formatLabelExample(text: string): string | null {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < MIN_EXAMPLE_CHARS) return null;
  return cleaned.length > ORBIT_LABEL_EXAMPLE_MAX_CHARS
    ? `${cleaned.slice(0, ORBIT_LABEL_EXAMPLE_MAX_CHARS - 1).trimEnd()}…`
    : cleaned;
}

function groupExamples(rows: Array<{ labelId: string; text: string }>) {
  const byLabel = new Map<string, string[]>();
  for (const row of rows) {
    const example = formatLabelExample(row.text);
    if (!example) continue;
    const list = byLabel.get(row.labelId) ?? [];
    if (list.length >= ORBIT_LABEL_EXAMPLES_PER_LABEL || list.includes(example)) {
      continue;
    }
    list.push(example);
    byLabel.set(row.labelId, list);
  }
  return byLabel;
}

/** Most recent posts per tag and per user collection, keyed by label id. */
export async function loadOrbitLabelExamples(args: {
  userId: string;
  tagIds: string[];
  collectionIds: string[];
}): Promise<{ tags: Map<string, string[]>; collections: Map<string, string[]> }> {
  const empty = { tags: new Map<string, string[]>(), collections: new Map<string, string[]>() };
  try {
    const [tagRows, collectionRows] = await Promise.all([
      args.tagIds.length === 0
        ? []
        : prisma.$queryRaw<Array<{ labelId: string; text: string }>>`
            SELECT ranked."labelId", ranked."text"
            FROM (
              SELECT bt."tagId" AS "labelId", b."tweetText" AS "text",
                ROW_NUMBER() OVER (
                  PARTITION BY bt."tagId"
                  ORDER BY b."bookmarkedAt" DESC, b."id" DESC
                ) AS rank
              FROM "BookmarkTag" bt
              INNER JOIN "Bookmark" b ON b."id" = bt."bookmarkId"
              WHERE bt."tagId" = ANY(${args.tagIds})
                AND b."userId" = ${args.userId}
                AND length(b."tweetText") >= ${MIN_EXAMPLE_CHARS}
            ) ranked
            WHERE ranked.rank <= ${ROWS_PER_LABEL}
          `,
      args.collectionIds.length === 0
        ? []
        : prisma.$queryRaw<Array<{ labelId: string; text: string }>>`
            SELECT ranked."labelId", ranked."text"
            FROM (
              SELECT ci."collectionId" AS "labelId", b."tweetText" AS "text",
                ROW_NUMBER() OVER (
                  PARTITION BY ci."collectionId"
                  ORDER BY b."bookmarkedAt" DESC, b."id" DESC
                ) AS rank
              FROM "CollectionItem" ci
              INNER JOIN "Bookmark" b ON b."id" = ci."bookmarkId"
              WHERE ci."collectionId" = ANY(${args.collectionIds})
                AND b."userId" = ${args.userId}
                AND length(b."tweetText") >= ${MIN_EXAMPLE_CHARS}
            ) ranked
            WHERE ranked.rank <= ${ROWS_PER_LABEL}
          `,
    ]);
    return { tags: groupExamples(tagRows), collections: groupExamples(collectionRows) };
  } catch (error) {
    // Examples sharpen Jev's answers; a scan still works on names alone.
    logWarn("OrbitLabelExamples", "Could not load label examples.", error);
    return empty;
  }
}

/** Example posts for the named tags, keyed by `normalizeTagKey` of the name. */
export async function loadOrbitTagExamplesByName(
  userId: string,
  names: string[]
): Promise<Map<string, string[]>> {
  if (names.length === 0) return new Map();
  try {
    const tags = await prisma.tag.findMany({
      where: { userId, name: { in: names } },
      select: { id: true, name: true },
    });
    const { tags: byId } = await loadOrbitLabelExamples({
      userId,
      tagIds: tags.map((tag) => tag.id),
      collectionIds: [],
    });
    const byKey = new Map<string, string[]>();
    for (const tag of tags) {
      const examples = byId.get(tag.id);
      if (examples?.length) byKey.set(normalizeTagKey(tag.name), examples);
    }
    return byKey;
  } catch (error) {
    logWarn("OrbitLabelExamples", "Could not load tag examples.", error);
    return new Map();
  }
}
