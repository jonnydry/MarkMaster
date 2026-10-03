import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { buildOrbitGraphPayload } from "@/lib/orbit-graph-query";
import { buildOrbitGraphETag } from "@/lib/orbit-graph-etag";
import {
  getUserCachedJson,
  lookupUserCache,
  readUserCacheVersion,
} from "@/lib/upstash-cache";
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

  // Every request counts against the bucket, malformed ones included; the
  // check runs while the query is validated and the cache is read.
  const rateLimit = checkRateLimit("orbit:graph", user.id);

  const queryParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = orbitGraphQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    const limited = await rateLimit;
    if (!limited.success) return createRateLimitResponse(limited);
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
  const cacheKey = `cache:orbit:graph:${user.id}:${scope}:${nodeCap}:${expandKey}`;
  const etagFor = (cacheVersion: number) =>
    buildOrbitGraphETag({ cacheVersion, scope, nodeCap, expandKey });

  // A revalidation is answered from the cache generation alone, so it reads
  // one small key instead of the cached graph. Either read overlaps the
  // rate-limit check; a limited request still gets its 429 first.
  const ifNoneMatch = req.headers.get("if-none-match");
  const currentVersion = ifNoneMatch ? readUserCacheVersion(user.id) : null;
  const lookup = ifNoneMatch
    ? undefined
    : lookupUserCache<OrbitGraphPayload>(user.id, cacheKey);

  const rateLimitResult = await rateLimit;
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  if (currentVersion) {
    const version = await currentVersion;
    if (version !== null && ifNoneMatch === etagFor(version)) {
      return new NextResponse(null, {
        status: 304,
        headers: { ...GRAPH_CACHE_HEADERS, ETag: ifNoneMatch },
      });
    }
  }

  const { value: payload, version } =
    await getUserCachedJson<OrbitGraphPayload>(
      user.id,
      cacheKey,
      60,
      async () => {
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
      },
      lookup
    );

  // Without a known generation (Redis unavailable) nothing can vouch that a
  // later request is unchanged, so no ETag is offered.
  return NextResponse.json(payload, {
    headers:
      version !== null
        ? { ...GRAPH_CACHE_HEADERS, ETag: etagFor(version) }
        : GRAPH_CACHE_HEADERS,
  });
}
