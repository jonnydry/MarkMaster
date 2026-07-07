import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { buildOrbitGraphPayload } from "@/lib/orbit-graph-query";
import { buildOrbitGraphETag } from "@/lib/orbit-graph-etag";
import { getCachedJson, getUserCacheVersion } from "@/lib/upstash-cache";
import {
  orbitGraphQuerySchema,
  DEFAULT_ORBIT_GRAPH_NODE_CAP,
} from "@/lib/validations";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import type { OrbitGraphPayload } from "@/types";

const GRAPH_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
} as const;

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("orbit:graph", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const queryParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = orbitGraphQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const nodeCap = parsed.data.nodeCap ?? DEFAULT_ORBIT_GRAPH_NODE_CAP;
  const scope = parsed.data.scope ?? "library";
  const expandAnchorIds = parsed.data.expand ?? [];
  const expandKey = [...expandAnchorIds].sort().join(",");
  const cacheVersion = await getUserCacheVersion(user.id);
  const cacheKey = `cache:orbit:graph:${user.id}:v${cacheVersion}:${scope}:${nodeCap}:${expandKey}`;

  const payload = await getCachedJson<OrbitGraphPayload>(cacheKey, 60, async () => {
    const graph = await buildOrbitGraphPayload({
      userId: user.id,
      scope,
      nodeCap,
      expandAnchorIds,
    });

    return {
      ...graph,
      generatedAt: new Date().toISOString(),
    };
  });

  const etag = buildOrbitGraphETag({
    cacheVersion,
    scope,
    nodeCap,
    expandKey,
    generatedAt: payload.generatedAt,
  });

  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ...GRAPH_CACHE_HEADERS,
        ETag: etag,
      },
    });
  }

  return NextResponse.json(payload, {
    headers: {
      ...GRAPH_CACHE_HEADERS,
      ETag: etag,
    },
  });
}
