import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMediaBreakdown } from "@/lib/analytics";
import { getCachedJson, getUserCacheVersion } from "@/lib/upstash-cache";
import { timeZoneSchema } from "@/lib/validations";
import { Prisma } from "@prisma/client";
import type { AnalyticsData } from "@/types";

/**
 * Minimal time filter for flywheel events only (Slice 2).
 * Uses existing range semantics from the client selector. "all" means no time bound.
 * Silent: no UI labels added anywhere; the range control already communicates scope.
 */
function getFlywheelCreatedAtFilter(range: string): Prisma.Sql {
  switch (range) {
    case "30d":
      return Prisma.sql`AND "createdAt" >= NOW() - INTERVAL '30 days'`;
    case "90d":
      return Prisma.sql`AND "createdAt" >= NOW() - INTERVAL '90 days'`;
    case "12m":
      return Prisma.sql`AND "createdAt" >= NOW() - INTERVAL '12 months'`;
    case "all":
    default:
      return Prisma.sql``;
  }
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Slice 2: parse range (defaults to 90d to match client initial state); used only for flywheel query.
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "90d";
  const allowedRanges = ["30d", "90d", "12m", "all"] as const;
  const range: "30d" | "90d" | "12m" | "all" =
    allowedRanges.includes(rangeParam as (typeof allowedRanges)[number])
      ? (rangeParam as "30d" | "90d" | "12m" | "all")
      : "90d";
  const fwTimeFilter = getFlywheelCreatedAtFilter(range);

  const timeZoneParam = req.nextUrl.searchParams.get("timeZone");
  const parsedTimeZone =
    timeZoneParam === null ? null : timeZoneSchema.safeParse(timeZoneParam);
  if (parsedTimeZone && !parsedTimeZone.success) {
    return NextResponse.json(
      { error: "Invalid timeZone parameter" },
      { status: 400 }
    );
  }
  const timeZone = parsedTimeZone?.data ?? "UTC";

  const cacheVersion = await getUserCacheVersion(user.id);
  const cacheKey = `cache:analytics:${user.id}:v${cacheVersion}:${range}:${timeZone}`;

  const analyticsPayload = await getCachedJson<AnalyticsData>(cacheKey, 120, async () => {
  const [
    authorRows,
    monthRows,
    dayRows,
    tags,
    mediaCountsRows,
    untaggedRows,
    notedRows,
    velocityRows,
  ] = await Promise.all([
    prisma.$queryRaw<
      {
        author: string;
        displayName: string | null;
        profileImage: string | null;
        verified: boolean;
        count: bigint;
      }[]
    >`
      SELECT
        "authorUsername" AS author,
        MAX("authorDisplayName") AS "displayName",
        MAX("authorProfileImage") AS "profileImage",
        BOOL_OR("authorVerified") AS verified,
        COUNT(*)::bigint AS count
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
      GROUP BY "authorUsername"
      ORDER BY count DESC
      LIMIT 10
    `,
    // "bookmarkedAt" is a naive UTC timestamp: convert to timestamptz first,
    // then bucket in the caller's zone. timeZone is a validated bind parameter.
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT to_char("bookmarkedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') as month, COUNT(*)::bigint as count
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
      GROUP BY month
      ORDER BY month ASC
    `,
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char("bookmarkedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') as day, COUNT(*)::bigint as count
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
        AND "bookmarkedAt" >= NOW() - INTERVAL '180 days'
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.tag.findMany({
      where: { userId: user.id },
      include: { _count: { select: { bookmarks: true } } },
    }),
    prisma.$queryRaw<
      {
        totalBookmarks: bigint;
        mediaOnly: bigint;
        mediaAndLinks: bigint;
        linksOnly: bigint;
        textOnly: bigint;
      }[]
    >`
      SELECT
        COUNT(*)::bigint AS "totalBookmarks",
        COUNT(*) FILTER (
          WHERE media_count > 0 AND links_count = 0
        )::bigint AS "mediaOnly",
        COUNT(*) FILTER (
          WHERE media_count > 0 AND links_count > 0
        )::bigint AS "mediaAndLinks",
        COUNT(*) FILTER (
          WHERE media_count = 0 AND links_count > 0
        )::bigint AS "linksOnly",
        COUNT(*) FILTER (
          WHERE media_count = 0 AND links_count = 0
        )::bigint AS "textOnly"
      FROM (
        SELECT
          CASE
            WHEN jsonb_typeof("media") = 'array' THEN jsonb_array_length("media")
            ELSE 0
          END AS media_count,
          CASE
            WHEN jsonb_typeof("urls") = 'array' THEN jsonb_array_length("urls")
            ELSE 0
          END AS links_count
        FROM "Bookmark"
        WHERE "userId" = ${user.id}
      ) bookmark_stats
    `,
    prisma.$queryRaw<
      {
        untaggedCount: bigint;
        oldestAt: Date | null;
        orbitQueueCount: bigint;
        rawHighlightsCount: bigint;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE NOT has_tags)::bigint AS "untaggedCount",
        MIN("bookmarkedAt") FILTER (WHERE NOT has_tags) AS "oldestAt",
        COUNT(*) FILTER (
          WHERE NOT has_tags AND NOT has_user_collection
        )::bigint AS "orbitQueueCount",
        COUNT(*) FILTER (
          WHERE NOT has_tags AND NOT has_any_collection
        )::bigint AS "rawHighlightsCount"
      FROM (
        SELECT
          b."id",
          b."bookmarkedAt",
          EXISTS (
            SELECT 1
            FROM "BookmarkTag" bt
            WHERE bt."bookmarkId" = b."id"
          ) AS has_tags,
          EXISTS (
            SELECT 1
            FROM "CollectionItem" ci
            INNER JOIN "Collection" c ON c."id" = ci."collectionId"
            WHERE ci."bookmarkId" = b."id"
              AND c."type" = 'user_collection'::"CollectionType"
          ) AS has_user_collection,
          EXISTS (
            SELECT 1
            FROM "CollectionItem" ci
            WHERE ci."bookmarkId" = b."id"
          ) AS has_any_collection
        FROM "Bookmark" b
        WHERE b."userId" = ${user.id}
      ) bookmark_triage
    `,
    prisma.$queryRaw<{ notedCount: bigint }[]>`
      SELECT COUNT(DISTINCT n."bookmarkId")::bigint AS "notedCount"
      FROM "Note" n
      WHERE n."userId" = ${user.id}
    `,
    prisma.$queryRaw<{ last30d: bigint; previous30d: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "bookmarkedAt" >= NOW() - INTERVAL '30 days')::bigint AS "last30d",
        COUNT(*) FILTER (
          WHERE "bookmarkedAt" >= NOW() - INTERVAL '60 days'
            AND "bookmarkedAt" < NOW() - INTERVAL '30 days'
        )::bigint AS "previous30d"
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
    `,
  ]);

  // Flywheel aggregates are optional: schema may exist before migration is applied.
  let flywheelRows: { eventType: string; source: string | null; count: bigint }[] = [];
  try {
    flywheelRows = await prisma.$queryRaw<
      { eventType: string; source: string | null; count: bigint }[]
    >`
      SELECT "eventType", COALESCE("payload"->>'source', '') AS source, COUNT(*)::bigint as count
      FROM "FlywheelEvent"
      WHERE "userId" = ${user.id}
      ${fwTimeFilter}
      GROUP BY "eventType", source
    `;
  } catch (err) {
    console.warn(
      "[analytics] FlywheelEvent query failed — run prisma migrate deploy",
      err
    );
  }

  // Orbit decision aggregates are optional for the same migration-stagger reason.
  let orbitDecisionRows: { action: string; confidence: string | null; count: bigint }[] = [];
  try {
    orbitDecisionRows = await prisma.$queryRaw<
      { action: string; confidence: string | null; count: bigint }[]
    >`
      SELECT
        "action",
        COALESCE("originalSuggestion"->>'confidence', '') AS confidence,
        COUNT(*)::bigint as count
      FROM "OrbitDecisionEvent"
      WHERE "userId" = ${user.id}
      ${fwTimeFilter}
      GROUP BY "action", COALESCE("originalSuggestion"->>'confidence', '')
    `;
  } catch (err) {
    console.warn(
      "[analytics] OrbitDecisionEvent query failed — run prisma migrate deploy",
      err
    );
  }

  const mediaCounts = mediaCountsRows[0] ?? {
    totalBookmarks: BigInt(0),
    mediaOnly: BigInt(0),
    mediaAndLinks: BigInt(0),
    linksOnly: BigInt(0),
    textOnly: BigInt(0),
  };

  const totalBookmarks = Number(mediaCounts.totalBookmarks);

  const topAuthors = authorRows.map((r) => ({
    author: r.author,
    displayName: r.displayName,
    profileImage: r.profileImage,
    verified: Boolean(r.verified),
    count: Number(r.count),
  }));

  const bookmarksByMonth = monthRows.map((r) => ({
    month: r.month,
    count: Number(r.count),
  }));

  const bookmarksByDay = dayRows.map((r) => ({
    day: r.day,
    count: Number(r.count),
  }));

  const tagDistribution = tags
    .map((t) => ({
      id: t.id,
      tag: t.name,
      color: t.color,
      count: t._count.bookmarks,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const untagged = untaggedRows[0] ?? {
    untaggedCount: BigInt(0),
    oldestAt: null,
    orbitQueueCount: BigInt(0),
    rawHighlightsCount: BigInt(0),
  };
  const noted = notedRows[0] ?? { notedCount: BigInt(0) };
  const velocity = velocityRows[0] ?? { last30d: BigInt(0), previous30d: BigInt(0) };

  // Phase 3 Item 12 Slice 3: map event counts (time-filtered) + source-grouped data for per-source effectiveness,
  // plus derivation of the two Slice 2 ratios + the new Quick Pass keep-rate outcome signal (minimal, from quick.keep events).
  // All server-side; client only renders with extreme restraint.
  const fwCounts: Record<string, number> = {};
  const fwSourceData: Record<string, Record<string, number>> = {};
  for (const r of flywheelRows) {
    const et = r.eventType;
    const src = r.source || "";
    const n = Number(r.count);
    fwCounts[et] = (fwCounts[et] || 0) + n;
    if (!fwSourceData[et]) fwSourceData[et] = {};
    const key = src || "direct";
    fwSourceData[et][key] = (fwSourceData[et][key] || 0) + n;
  }

  const digestCta = fwCounts["cta.digest_review_together"] ?? 0;
  const sessions = fwCounts["digest.session_start"] ?? 0;
  const quick = fwCounts["mode.quick"] ?? 0;
  const deep = fwCounts["mode.deep"] ?? 0;
  const modeTotal = quick + deep;

  const digestCtaToSessionRate = digestCta > 0 ? Math.min(1, sessions / digestCta) : 0;
  const quickPassShare = modeTotal > 0 ? Math.min(1, quick / modeTotal) : 0;

  // Slice 3 per-source: aggregate entry drivers (review CTAs + digest sessions) by originating source for effectiveness insight
  const entryBySource: Record<string, number> = {};
  for (const [src, c] of Object.entries(fwSourceData["cta.review_in_orbit"] || {})) {
    entryBySource[src] = (entryBySource[src] || 0) + c;
  }
  for (const [src, c] of Object.entries(fwSourceData["digest.session_start"] || {})) {
    entryBySource[src] = (entryBySource[src] || 0) + c;
  }
  const totalEntry = Object.values(entryBySource).reduce((a, b) => a + b, 0);
  const topEntrySources = Object.entries(entryBySource)
    .filter(([source]) => source && source !== "direct")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([source, count]) => ({
      source,
      count,
      pct: totalEntry > 0 ? count / totalEntry : 0,
    }));

  // Slice 3 Quick Pass outcome: % of quick activity that recorded a keep decision (simple high-signal proxy from lightweight instrumentation)
  const quickKeeps = fwCounts["quick.keep"] ?? 0;
  const quickPassKeepRate = quick > 0 ? Math.min(1, quickKeeps / quick) : 0;

  const orbitDecisionCounts: Record<string, number> = {};
  let orbitHighConfidenceDecisions = 0;
  let orbitHighConfidenceAccepted = 0;
  for (const row of orbitDecisionRows) {
    const action = row.action || "";
    const count = Number(row.count);
    orbitDecisionCounts[action] = (orbitDecisionCounts[action] || 0) + count;
    if (row.confidence === "high") {
      orbitHighConfidenceDecisions += count;
      if (action === "accepted") {
        orbitHighConfidenceAccepted += count;
      }
    }
  }
  const orbitDecisionAccepted = orbitDecisionCounts.accepted ?? 0;
  const orbitDecisionEdited = orbitDecisionCounts.edited ?? 0;
  const orbitDecisionKept = orbitDecisionCounts.kept ?? 0;
  const orbitDecisionRejected = orbitDecisionCounts.rejected ?? 0;
  const orbitDecisionTotal =
    orbitDecisionAccepted + orbitDecisionEdited + orbitDecisionKept + orbitDecisionRejected;
  const orbitDecisionAcceptRate =
    orbitDecisionTotal > 0 ? orbitDecisionAccepted / orbitDecisionTotal : 0;
  const orbitDecisionEditRate =
    orbitDecisionTotal > 0 ? orbitDecisionEdited / orbitDecisionTotal : 0;
  const orbitHighConfidenceAcceptRate =
    orbitHighConfidenceDecisions > 0
      ? orbitHighConfidenceAccepted / orbitHighConfidenceDecisions
      : 0;

  return {
    topAuthors,
    mediaBreakdown: buildMediaBreakdown({
      totalBookmarks,
      mediaOnly: Number(mediaCounts.mediaOnly),
      mediaAndLinks: Number(mediaCounts.mediaAndLinks),
      linksOnly: Number(mediaCounts.linksOnly),
      textOnly: Number(mediaCounts.textOnly),
    }),
    tagDistribution,
    bookmarksByMonth,
    bookmarksByDay,
    totalBookmarks,
    untaggedCount: Number(untagged.untaggedCount),
    untaggedOldestAt: untagged.oldestAt ? untagged.oldestAt.toISOString() : null,
    orbitQueueCount: Number(untagged.orbitQueueCount),
    rawHighlightsCount: Number(untagged.rawHighlightsCount),
    notedCount: Number(noted.notedCount),
    last30dCount: Number(velocity.last30d),
    previous30dCount: Number(velocity.previous30d),
    flywheelCtaReviewInOrbit: fwCounts["cta.review_in_orbit"] ?? 0,
    flywheelDigestReviewTogether: fwCounts["cta.digest_review_together"] ?? 0,
    flywheelFeedbackGood: fwCounts["feedback.good"] ?? 0,
    flywheelFeedbackNotRelevant: fwCounts["feedback.not_relevant"] ?? 0,
    flywheelQuickModeToggles: fwCounts["mode.quick"] ?? 0,
    flywheelDeepModeToggles: fwCounts["mode.deep"] ?? 0,
    flywheelDigestSessions: fwCounts["digest.session_start"] ?? 0,
    flywheelDigestCtaToSessionRate: digestCtaToSessionRate,
    flywheelQuickPassShare: quickPassShare,
    flywheelTopEntrySources: topEntrySources,
    flywheelQuickKeepCount: quickKeeps,
    flywheelQuickPassKeepRate: quickPassKeepRate,
    orbitDecisionAccepted,
    orbitDecisionEdited,
    orbitDecisionKept,
    orbitDecisionRejected,
    orbitDecisionTotal,
    orbitDecisionAcceptRate,
    orbitDecisionEditRate,
    orbitHighConfidenceAcceptRate,
  };
  });

  return NextResponse.json(analyticsPayload, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}
