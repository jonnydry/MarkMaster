import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFreshXAccessToken } from "@/lib/x-api";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accessToken: string;
  try {
    accessToken = await getFreshXAccessToken(user.id);
  } catch {
    return NextResponse.json(
      { error: "Could not refresh X access token. Sign in again." },
      { status: 401 }
    );
  }

  const collection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    include: {
      items: {
        include: { bookmark: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.items.length === 0) {
    return NextResponse.json({ error: "Collection is empty" }, { status: 400 });
  }

  const tweets: string[] = [];

  const header = `${collection.name}\n\n${collection.description || "A curated bookmark collection"}\n\n🔖 ${collection.items.length} bookmarks — thread 🧵`;
  tweets.push(header);

  for (const item of collection.items) {
    const b = item.bookmark;
    const tweetUrl = `https://x.com/${b.authorUsername}/status/${b.tweetId}`;
    const snippet = b.tweetText.length > 200
      ? b.tweetText.slice(0, 197) + "..."
      : b.tweetText;
    tweets.push(`@${b.authorUsername}:\n"${snippet}"\n\n${tweetUrl}`);
  }

  const appOrigin =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    "";
  const sharePath = `/share/${collection.shareSlug || collection.id}`;
  const shareUrl = appOrigin ? `${appOrigin}${sharePath}` : sharePath;

  tweets.push(
    `That's the thread! Curated with MarkMaster.\n\nSee the full collection: ${shareUrl}`
  );

  const postedIds: string[] = [];

  try {
    for (let i = 0; i < tweets.length; i++) {
      const body: Record<string, unknown> = { text: tweets[i] };
      if (i > 0 && postedIds.length > 0) {
        body.reply = { in_reply_to_tweet_id: postedIds[postedIds.length - 1] };
      }

      const response = await fetch("https://api.x.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          detail?: string;
          title?: string;
          errors?: Array<{ message?: string }>;
        };
        const detail =
          err.detail ||
          err.errors?.[0]?.message ||
          err.title ||
          response.statusText;
        return NextResponse.json(
          {
            error: `Failed to post tweet ${i + 1}: ${detail}`,
            postedCount: postedIds.length,
          },
          { status: 500 }
        );
      }

      const data = await response.json();
      postedIds.push(data.data.id);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to post thread",
        postedCount: postedIds.length,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    threadUrl: `https://x.com/i/status/${postedIds[0]}`,
    tweetCount: postedIds.length,
  });
}
