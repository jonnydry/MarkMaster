import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  OrbitGrokError,
  applyOrbitScanPlan,
  orbitScanRequestSchema,
  scanOrbitBookmarksWithXai,
} from "@/lib/orbit-grok";
import { getAuthorPriorHintsForScan } from "@/lib/orbit-author-history";
import { ORBIT_SCAN_ENRICHMENT } from "@/lib/orbit-config";
import { getOrbitLearningHintsForScan } from "@/lib/orbit-decision-events";
import { enrichBookmarksForScan } from "@/lib/orbit-scan-enrichment";
import { getOrbitNeighborHintsForScan } from "@/lib/orbit-scan-neighbors";
import { mapOrbitScannedBookmarksForClient } from "@/lib/orbit-scan-bookmarks";
import { readJsonBody } from "@/lib/request-body";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { computeOrbitScanSignalQuality } from "@/lib/orbit-scan-signal-quality";
import type { OrbitScanErrorPayload } from "@/types";
import { checkRateLimit, checkGlobalRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

const orbitScanBookmarkInclude = {
  notes: { select: { id: true, content: true } },
  collectionItems: {
    select: {
      collection: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit Orbit scans (more generous than syncs). Run both checks in
  // parallel — they're independent Redis round-trips.
  const [rateLimitResult, globalResult] = await Promise.all([
    checkRateLimit("orbit", user.id),
    checkGlobalRateLimit("orbit"),
  ]);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }
  if (!globalResult.success) {
    return createRateLimitResponse(globalResult);
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = orbitScanRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.mode === "scan") {
      const [bookmarks, tags, collections] = await Promise.all([
        prisma.bookmark.findMany({
          where: {
            userId: user.id,
            id: { in: parsed.data.bookmarkIds },
          },
          include: orbitScanBookmarkInclude,
        }),
        prisma.tag.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            name: true,
            color: true,
            _count: { select: { bookmarks: true } },
          },
          orderBy: { bookmarks: { _count: "desc" } },
        }),
        prisma.collection.findMany({
          where: {
            userId: user.id,
            type: "user_collection",
          },
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { items: true } },
          },
          orderBy: { items: { _count: "desc" } },
        }),
      ]);

      if (bookmarks.length !== parsed.data.bookmarkIds.length) {
        return NextResponse.json(
          { error: "One or more bookmarks could not be found." },
          { status: 404 }
        );
      }

      const bookmarkOrder = new Map(
        parsed.data.bookmarkIds.map((bookmarkId, index) => [bookmarkId, index])
      );
      bookmarks.sort(
        (a, b) =>
          (bookmarkOrder.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (bookmarkOrder.get(b.id) ?? Number.POSITIVE_INFINITY)
      );

      let bookmarksWithFolderHints = bookmarks.map(
        ({ collectionItems, ...bookmark }) => ({
          ...bookmark,
          xFolderHints: collectionItems.flatMap(({ collection }) =>
            collection.type === "x_folder"
              ? [{ id: collection.id, name: collection.name }]
              : []
          ),
        })
      );

      let enrichmentMetadata:
        | {
            attempted: number;
            refreshed: number;
            skipped: number;
            failed?: number;
            reason?: "rate_limited" | "auth_error" | "none_needed" | "error";
          }
        | undefined;

      if (ORBIT_SCAN_ENRICHMENT) {
        const enrichmentResult = await enrichBookmarksForScan(
          user.id,
          bookmarksWithFolderHints
        );
        bookmarksWithFolderHints = enrichmentResult.bookmarks as typeof bookmarksWithFolderHints;
        enrichmentMetadata = enrichmentResult.enrichment;
      }

      const existingTags = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        bookmarkCount: tag._count.bookmarks,
      }));
      const existingCollections = collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        bookmarkCount: collection._count.items,
      }));
      const signalQuality = computeOrbitScanSignalQuality({
        bookmarks: bookmarksWithFolderHints,
        existingTags,
        existingCollections,
      });

      const [authorPriorHints, learningHints, neighborHints] = await Promise.all([
        getAuthorPriorHintsForScan(
          user.id,
          bookmarksWithFolderHints.map((bookmark) => bookmark.authorUsername)
        ),
        getOrbitLearningHintsForScan({
          userId: user.id,
          bookmarks: bookmarksWithFolderHints,
        }),
        getOrbitNeighborHintsForScan({
          userId: user.id,
          bookmarks: bookmarksWithFolderHints,
        }),
      ]);

      const scan = await scanOrbitBookmarksWithXai({
        bookmarks: bookmarksWithFolderHints,
        existingTags,
        existingCollections,
        authorPriorHints,
        learningHints,
        neighborHints,
        batch: parsed.data.batch,
      });

      scan.batch = {
        ...scan.batch,
        signalQuality,
        ...(enrichmentMetadata ? { enrichment: enrichmentMetadata } : {}),
      };

      return NextResponse.json({
        ...scan,
        scannedBookmarks: mapOrbitScannedBookmarksForClient(bookmarksWithFolderHints),
      });
    }

    const applied = await applyOrbitScanPlan({
      userId: user.id,
      plan: parsed.data.plan,
      createCollections: parsed.data.createCollections,
    });

    await invalidateUserResponseCache(user.id);

    return NextResponse.json({ applied });
  } catch (error) {
    if (error instanceof OrbitGrokError) {
      const payload: OrbitScanErrorPayload = {
        error: error.message,
        code: error.code,
      };
      if (error.retryAfterSeconds !== undefined) {
        payload.retryAfterSeconds = error.retryAfterSeconds;
      }

      return NextResponse.json(payload, { status: error.status });
    }

    console.error("[orbit] scan failed unexpectedly:", error);

    return NextResponse.json(
      {
        error: "Orbit scan failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}
