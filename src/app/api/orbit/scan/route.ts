import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  OrbitScanError,
  applyOrbitScanPlan,
  orbitScanRequestSchema,
  scanOrbitBookmarksWithXai,
} from "@/lib/orbit-grok";
import { getAuthorPriorHintsForScan } from "@/lib/orbit-author-history";
import { ORBIT_SCAN_ENRICHMENT } from "@/lib/orbit-config";
import { getOrbitLearningHintsForScan } from "@/lib/orbit-decision-events";
import { enrichBookmarksForScan } from "@/lib/orbit-scan-enrichment";
import { getOrbitNeighborHintsForScan } from "@/lib/orbit-scan-neighbors";
import {
  mapOrbitScannedBookmarksForClient,
  orbitScanBookmarkInclude,
  withOrbitFolderHints,
} from "@/lib/orbit-scan-bookmarks";
import { logError } from "@/lib/logger";
import { readJsonBody } from "@/lib/request-body";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { computeOrbitScanSignalQuality } from "@/lib/orbit-scan-signal-quality";
import type { OrbitScanProgressSink } from "@/lib/orbit-hybrid-scan";
import type {
  OrbitScanErrorPayload,
  OrbitScanResponsePayload,
  OrbitScanStreamLine,
} from "@/types";
import { checkRateLimit, checkGlobalRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * Hybrid scans are usually Jev-bound; leftover Grok escalation can still
 * take up to 180 s (see orbit-grok.ts). Keep enough platform budget.
 */
export const maxDuration = 240;

function scanErrorResponse(error: unknown): {
  status: number;
  payload: OrbitScanErrorPayload | { error: string };
} {
  if (error instanceof OrbitScanError) {
    const payload: OrbitScanErrorPayload = {
      error: error.message,
      code: error.code,
    };
    if (error.retryAfterSeconds !== undefined) {
      payload.retryAfterSeconds = error.retryAfterSeconds;
    }
    return { status: error.status, payload };
  }

  logError("orbit", "scan failed unexpectedly", error);
  return { status: 500, payload: { error: "Orbit scan failed unexpectedly." } };
}

/**
 * NDJSON: progress lines while the scan runs, then one result or error line.
 * `no-transform` keeps `next start` gzip from buffering the lines.
 */
function streamScan(
  run: (onProgress: OrbitScanProgressSink) => Promise<OrbitScanResponsePayload>
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: OrbitScanStreamLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The client went away; the scan still finishes and caches.
        }
      };
      try {
        send({ type: "phase", phase: "prepare" });
        send({ type: "result", payload: await run(send) });
      } catch (error) {
        const { status, payload } = scanErrorResponse(error);
        send({
          type: "error",
          status,
          error: "code" in payload ? payload : { error: payload.error, code: "unknown" },
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      const scanRequest = parsed.data;
      // Only AI scans consume the scarce per-user and system-wide Orbit
      // budgets. Applying an already-reviewed plan is a normal write and is
      // protected by the proxy's api:write limiter instead.
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

      const runScan = async (
        onProgress?: OrbitScanProgressSink
      ): Promise<OrbitScanResponsePayload> => {
        const bookmarkOrder = new Map(
          scanRequest.bookmarkIds.map((bookmarkId, index) => [bookmarkId, index])
        );
        bookmarks.sort(
          (a, b) =>
            (bookmarkOrder.get(a.id) ?? Number.POSITIVE_INFINITY) -
            (bookmarkOrder.get(b.id) ?? Number.POSITIVE_INFINITY)
        );

        let bookmarksWithFolderHints = bookmarks.map(withOrbitFolderHints);
        const authorUsernames = bookmarksWithFolderHints.map(
          (bookmark) => bookmark.authorUsername
        );
        const authorPriorHintsPromise = getAuthorPriorHintsForScan(
          user.id,
          authorUsernames
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
          authorPriorHintsPromise,
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
          userId: user.id,
          bookmarks: bookmarksWithFolderHints,
          existingTags,
          existingCollections,
          authorPriorHints,
          learningHints,
          neighborHints,
          batch: scanRequest.batch,
          onProgress,
        });

        scan.batch = {
          ...scan.batch,
          signalQuality,
          ...(enrichmentMetadata ? { enrichment: enrichmentMetadata } : {}),
        };

        return {
          ...scan,
          scannedBookmarks: mapOrbitScannedBookmarksForClient(bookmarksWithFolderHints),
        };
      };

      if (scanRequest.stream) {
        return streamScan(runScan);
      }
      return NextResponse.json(await runScan());
    }

    const applied = await applyOrbitScanPlan({
      userId: user.id,
      plan: parsed.data.plan,
      createCollections: parsed.data.createCollections,
    });

    await invalidateUserResponseCache(user.id);

    return NextResponse.json({ applied });
  } catch (error) {
    const { status, payload } = scanErrorResponse(error);
    return NextResponse.json(payload, { status });
  }
}
