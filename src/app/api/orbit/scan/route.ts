import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  OrbitGrokError,
  applyOrbitScanPlan,
  orbitScanRequestSchema,
  scanOrbitBookmarksWithXai,
} from "@/lib/orbit-grok";

const orbitScanBookmarkInclude = {
  notes: { select: { id: true, content: true } },
} as const;

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        }),
        prisma.collection.findMany({
          where: {
            userId: user.id,
            type: "user_collection",
          },
          select: { id: true, name: true, description: true },
          orderBy: { updatedAt: "desc" },
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

      const scan = await scanOrbitBookmarksWithXai({
        bookmarks,
        existingTags: tags,
        existingCollections: collections,
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
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Orbit scan failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}
