import { NextRequest, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import {
  cardPageUrlFromMetadata,
  externalCardImageUrl,
  isTwimgUrl,
  previewableCardPageUrl,
  urlsWithCardImage,
} from "@/lib/bookmark-preview";
import { fetchPreviewImage, resolvePagePreviewImage } from "@/lib/link-preview";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ID_PATTERN = /^[a-z0-9]+$/i;

/**
 * Same-origin thumbnail for a link card whose image is not on Twitter's CDN.
 * The page CSP only allows pbs.twimg.com, so Hugging Face and other previews
 * have to be fetched here. The bookmark id is the only input — the destination
 * comes from data we already stored.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) {
    return missing();
  }

  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("media", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId: user.id },
      select: { urls: true, xMetadata: true },
    });
    if (!bookmark) return missing();

    const storedExternal = externalCardImageUrl(bookmark.urls);
    if (storedExternal) {
      if (isTwimgUrl(storedExternal)) {
        return NextResponse.redirect(storedExternal, 302);
      }
      const image = await fetchPreviewImage(storedExternal);
      return image ? imageResponse(image.bytes, image.contentType) : missing();
    }

    const pageUrl =
      previewableCardPageUrl(bookmark.urls) ??
      cardPageUrlFromMetadata(bookmark.xMetadata);
    if (!pageUrl) return missing();

    const imageUrl = await resolvePagePreviewImage(pageUrl);
    if (!imageUrl) return missing();

    if (isTwimgUrl(imageUrl)) {
      await rememberCardImage(id, user.id, bookmark.urls, pageUrl, imageUrl);
      return NextResponse.redirect(imageUrl, 302);
    }

    const image = await fetchPreviewImage(imageUrl);
    if (!image) return missing();
    await rememberCardImage(id, user.id, bookmark.urls, pageUrl, imageUrl);
    return imageResponse(image.bytes, image.contentType);
  } catch (error) {
    logError("card-image", "Link card preview failed", error);
    return missing();
  }
}

async function rememberCardImage(
  id: string,
  userId: string,
  urls: unknown,
  pageUrl: string,
  imageUrl: string
) {
  await prisma.bookmark.updateMany({
    where: { id, userId },
    data: { urls: urlsWithCardImage(urls, pageUrl, imageUrl) },
  });
}

function imageResponse(bytes: Uint8Array, contentType: string) {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function missing() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
