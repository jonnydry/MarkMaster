import { NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [libraryBookmarkCount, organizedRows] = await Promise.all([
    prisma.bookmark.count({ where: { userId: user.id } }),
    prisma.$queryRaw<{ organizedBookmarkCount: bigint }[]>`
      SELECT COUNT(DISTINCT ci."bookmarkId")::bigint AS "organizedBookmarkCount"
      FROM "CollectionItem" ci
      INNER JOIN "Collection" c ON c.id = ci."collectionId"
      WHERE c."userId" = ${user.id}
    `,
  ]);

  return NextResponse.json({
    libraryBookmarkCount,
    organizedBookmarkCount: Number(
      organizedRows[0]?.organizedBookmarkCount ?? 0
    ),
  }, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
  });
}
