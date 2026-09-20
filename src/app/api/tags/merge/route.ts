import { NextRequest, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/request-body";
import { mergeUserTags, TagMergeError } from "@/lib/tag-merge";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { mergeTagSchema } from "@/lib/validations";

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

  const parsed = mergeTagSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await mergeUserTags({
      userId: user.id,
      sourceTagId: parsed.data.sourceTagId,
      targetTagId: parsed.data.targetTagId,
    });
    await invalidateUserResponseCache(user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TagMergeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
