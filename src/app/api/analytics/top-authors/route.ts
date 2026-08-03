import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCachedJson, getUserCacheVersion } from "@/lib/upstash-cache";
import type { TopAuthorsResponse } from "@/types";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheVersion = await getUserCacheVersion(user.id);
  const payload = await getCachedJson<TopAuthorsResponse>(
    `cache:analytics-top-authors:${user.id}:v${cacheVersion}`,
    300,
    async () => {
      const rows = await prisma.$queryRaw<
        Array<{
          author: string;
          displayName: string | null;
          profileImage: string | null;
          verified: boolean;
          count: bigint;
        }>
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
        LIMIT 6
      `;

      return {
        topAuthors: rows.map((row) => ({
          author: row.author,
          displayName: row.displayName,
          profileImage: row.profileImage,
          verified: Boolean(row.verified),
          count: Number(row.count),
        })),
      };
    }
  );

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}
