import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateShareContent } from "@/lib/share-content";

function getConfiguredShareOrigin(req: NextRequest) {
  const configuredUrl =
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      return null;
    }
  }

  return process.env.NODE_ENV === "production" ? null : req.nextUrl.origin;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit collection publish/share operations
  const collection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    include: {
      items: {
        include: {
          bookmark: {
            select: {
              tweetId: true,
              authorUsername: true,
              authorDisplayName: true,
              tweetText: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!collection.isPublic || !collection.shareSlug) {
    return NextResponse.json(
      { error: "Collection must be public to share on X." },
      { status: 400 }
    );
  }

  const bookmarks = collection.items.map((item) => ({
    tweetId: item.bookmark.tweetId,
    authorUsername: item.bookmark.authorUsername,
    authorDisplayName: item.bookmark.authorDisplayName,
    tweetText: item.bookmark.tweetText,
  }));

  const shareOrigin = getConfiguredShareOrigin(req);
  if (!shareOrigin) {
    return NextResponse.json(
      { error: "Share origin is not configured." },
      { status: 500 }
    );
  }

  const shareContent = generateShareContent(
    collection.name,
    collection.description,
    bookmarks,
    collection.shareSlug,
    shareOrigin
  );

  return NextResponse.json(shareContent);
}
