import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportQuerySchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = exportQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { format } = parsed.data;

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id },
    include: {
      tags: { include: { tag: true } },
      notes: { select: { content: true } },
    },
    orderBy: { bookmarkedAt: "desc" },
  });

  if (format === "csv") {
    const header =
      "Tweet ID,Author,Username,Text,Likes,Retweets,Replies,Tags,Note,Tweet Date,Bookmarked Date,URL\n";
    const rows = bookmarks
      .map((b) => {
        const metrics = b.publicMetrics as Record<string, number> | null;
        const tags = b.tags.map((t) => t.tag.name).join("; ");
        const note = b.notes[0]?.content || "";
        const text = b.tweetText.replace(/"/g, '""');
        const url = `https://x.com/${b.authorUsername}/status/${b.tweetId}`;
        return `"${b.tweetId}","${b.authorDisplayName}","@${b.authorUsername}","${text}",${metrics?.like_count || 0},${metrics?.retweet_count || 0},${metrics?.reply_count || 0},"${tags}","${note.replace(/"/g, '""')}","${b.tweetCreatedAt.toISOString()}","${b.bookmarkedAt.toISOString()}","${url}"`;
      })
      .join("\n");

    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="markmaster-bookmarks-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const data = bookmarks.map((b) => ({
    tweetId: b.tweetId,
    author: { name: b.authorDisplayName, username: b.authorUsername },
    text: b.tweetText,
    metrics: b.publicMetrics,
    tags: b.tags.map((t) => t.tag.name),
    note: b.notes[0]?.content || null,
    tweetDate: b.tweetCreatedAt,
    bookmarkedDate: b.bookmarkedAt,
    url: `https://x.com/${b.authorUsername}/status/${b.tweetId}`,
  }));

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="markmaster-bookmarks-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
