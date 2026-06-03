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
import { getOrbitLearningHintsForScan } from "@/lib/orbit-decision-events";
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

  // Rate limit Orbit scans (more generous than syncs)
  const rateLimitResult = await checkRateLimit("orbit", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  // Global safety limit
  const globalResult = await checkGlobalRateLimit("orbit");
  if (!globalResult.success) {
    return createRateLimitResponse(globalResult);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = orbitScanRequestSchema.safeParse(body);
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

      const bookmarksWithFolderHints = bookmarks.map(
        ({ collectionItems, ...bookmark }) => ({
          ...bookmark,
          xFolderHints: collectionItems.flatMap(({ collection }) =>
            collection.type === "x_folder"
              ? [{ id: collection.id, name: collection.name }]
              : []
          ),
        })
      );

      const [authorPriorHints, learningHints] = await Promise.all([
        getAuthorPriorHintsForScan(
          user.id,
          bookmarksWithFolderHints.map((bookmark) => bookmark.authorUsername)
        ),
        getOrbitLearningHintsForScan({
          userId: user.id,
          bookmarks: bookmarksWithFolderHints,
        }),
      ]);

      const scan = await scanOrbitBookmarksWithXai({
        bookmarks: bookmarksWithFolderHints,
        existingTags: tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          bookmarkCount: tag._count.bookmarks,
        })),
        existingCollections: collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          description: collection.description,
          bookmarkCount: collection._count.items,
        })),
        authorPriorHints,
        learningHints,
      });

      return NextResponse.json(scan);
    }

    const applied = await applyOrbitScanPlan({
      userId: user.id,
      plan: parsed.data.plan,
      createCollections: parsed.data.createCollections,
    });

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
