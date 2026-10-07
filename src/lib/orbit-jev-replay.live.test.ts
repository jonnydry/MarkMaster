import { afterAll, describe, expect, it } from "vitest";

import { buildBookmarkPayload, normalizeKey } from "@/lib/orbit-grok-normalize";
import {
  assignOneOrbitBookmarkWithJev,
  shortlistOrbitTagsForJev,
} from "@/lib/orbit-jev-assign";
import {
  buildOrbitJevEvalCaseFromEvent,
  calibrateOrbitTagThresholds,
  scoreOrbitJevEvalCase,
  summarizeOrbitJevEval,
  type OrbitJevEvalScore,
} from "@/lib/orbit-jev-eval";
import { loadOrbitLabelExamples } from "@/lib/orbit-label-examples";
import { buildSeedOrbitLabelPool } from "@/lib/orbit-label-pool";
import {
  orbitScanBookmarkInclude,
  withOrbitFolderHints,
} from "@/lib/orbit-scan-bookmarks";
import { prisma } from "@/lib/prisma";
import { isTypeSafeConfigured } from "@/lib/typesafe";
import type { OrbitDecisionEventPayload } from "@/types";

/**
 * Replays recorded Orbit review decisions. Reads the database named by
 * DATABASE_URL; see docs/RUNBOOK.md ("Calibrating Orbit's Jev thresholds").
 *
 * - Calibration (RUN_ORBIT_JEV_REPLAY=1): no model calls. Shows how Jev's
 *   stored tag scores predicted what users kept, per threshold and per origin.
 * - Live replay (also RUN_LIVE_TYPESAFE_TESTS=1 and ORBIT_REPLAY_USER_ID):
 *   re-runs Jev on recent decisions against that user's current tags and
 *   reports how often the right tag never made the shortlist.
 */
const REPLAY =
  process.env.RUN_ORBIT_JEV_REPLAY === "1" && Boolean(process.env.DATABASE_URL);
const USER_ID = process.env.ORBIT_REPLAY_USER_ID?.trim() || undefined;
const LIVE =
  REPLAY &&
  process.env.RUN_LIVE_TYPESAFE_TESTS === "1" &&
  isTypeSafeConfigured() &&
  Boolean(USER_ID);
const EVENT_LIMIT = Number.parseInt(process.env.ORBIT_REPLAY_LIMIT ?? "", 10) || 500;
const LIVE_LIMIT = 25;

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

async function loadEvents(take: number): Promise<OrbitDecisionEventPayload[]> {
  const rows = await prisma.orbitDecisionEvent.findMany({
    where: USER_ID ? { userId: USER_ID } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      bookmarkId: true,
      action: true,
      source: true,
      mode: true,
      originalSuggestion: true,
      reviewedSuggestion: true,
    },
  });
  return rows as unknown as OrbitDecisionEventPayload[];
}

describe.skipIf(!REPLAY)("Orbit Jev replay over recorded review decisions", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports tag-score calibration from stored scores", async () => {
    const events = await loadEvents(EVENT_LIMIT);
    const report = calibrateOrbitTagThresholds(events);

    console.log(
      `\n${events.length} decisions · ${report.tagCount} suggested tags · ${report.scoredTagCount} with a Jev score`
    );
    console.table(
      report.rows.map((row) => ({
        threshold: row.threshold,
        suggested: row.suggested,
        kept: row.kept,
        precision: percent(row.precision),
        recall: percent(row.recall),
      }))
    );
    console.table(
      report.origins.map((row) => ({
        origin: row.origin,
        suggested: row.suggested,
        kept: row.kept,
        keptRate: percent(row.keptRate),
      }))
    );

    expect(report.tagCount).toBeGreaterThanOrEqual(report.scoredTagCount);
  });

  it.skipIf(!LIVE)(
    "re-runs Jev on recent decisions and reports shortlist misses",
    async () => {
      const userId = USER_ID!;
      const events = (await loadEvents(EVENT_LIMIT))
        .filter((event) => event.originalSuggestion)
        .slice(0, LIVE_LIMIT);

      const [tags, collections] = await Promise.all([
        prisma.tag.findMany({
          where: { userId },
          select: { id: true, name: true, color: true, _count: { select: { bookmarks: true } } },
          orderBy: { bookmarks: { _count: "desc" } },
        }),
        prisma.collection.findMany({
          where: { userId, type: "user_collection" },
          select: { id: true, name: true, description: true, _count: { select: { items: true } } },
          orderBy: { items: { _count: "desc" } },
        }),
      ]);
      const examples = await loadOrbitLabelExamples({
        userId,
        tagIds: tags.map((tag) => tag.id),
        collectionIds: collections.map((collection) => collection.id),
      });
      const existingTags = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        bookmarkCount: tag._count.bookmarks,
        examples: examples.tags.get(tag.id),
      }));
      const existingCollections = collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        bookmarkCount: collection._count.items,
        examples: examples.collections.get(collection.id),
      }));

      const scores: OrbitJevEvalScore[] = [];
      let expectedTagCount = 0;
      let shortlistMisses = 0;
      for (const event of events) {
        const row = await prisma.bookmark.findFirst({
          where: { id: event.bookmarkId, userId },
          include: orbitScanBookmarkInclude,
        });
        if (!row) continue;
        const bookmark = withOrbitFolderHints(row);
        const evalCase = buildOrbitJevEvalCaseFromEvent(event);
        // The user's whole current vocabulary, as a real scan would see it.
        const pool = buildSeedOrbitLabelPool({
          bookmarks: [bookmark],
          existingTags,
          existingCollections,
        });

        const shortlist = new Set(
          shortlistOrbitTagsForJev({
            pool: pool.tags,
            payload: buildBookmarkPayload({ bookmark, existingTags, existingCollections }),
          }).map((tag) => normalizeKey(tag.name))
        );
        const expected =
          evalCase.action === "accepted" || evalCase.action === "edited"
            ? evalCase.reviewedTags.length > 0
              ? evalCase.reviewedTags
              : evalCase.originalTags
            : [];
        expectedTagCount += expected.length;
        shortlistMisses += expected.filter((name) => !shortlist.has(normalizeKey(name))).length;

        const assignment = await assignOneOrbitBookmarkWithJev({
          bookmark,
          existingTags,
          existingCollections,
          pool,
        });
        scores.push(scoreOrbitJevEvalCase(evalCase, assignment));
      }

      const summary = summarizeOrbitJevEval(scores);
      console.log(
        [
          `\nReplayed ${summary.caseCount} decisions against ${tags.length} tags`,
          `useful ${percent(summary.usefulRate)}`,
          `tag recall ${percent(summary.tagRecall)}`,
          `false positives ${summary.falsePositiveCount}`,
          `kept tags missing from the shortlist ${shortlistMisses} of ${expectedTagCount}`,
        ].join(" · ")
      );
      expect(summary.caseCount).toBeLessThanOrEqual(LIVE_LIMIT);
    },
    600_000
  );
});
