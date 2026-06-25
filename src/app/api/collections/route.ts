import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { readJsonBody } from "@/lib/request-body";
import { createCollectionSchema } from "@/lib/validations";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
    include: { _count: { select: { items: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(collections, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
  });
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = createCollectionSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, description, isPublic } = parsed.data;

  const collection = await prisma.collection.create({
    data: {
      userId: user.id,
      name,
      description: description || null,
      type: "user_collection",
      isPublic: isPublic || false,
      shareSlug: isPublic ? nanoid(10) : null,
    },
  });

  await invalidateUserResponseCache(user.id);

  return NextResponse.json(collection);
}
