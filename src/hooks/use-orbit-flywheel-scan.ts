"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import type { OrbitReviewSession } from "@/lib/orbit-client-constants";
import type { OrbitScanRequest } from "@/lib/orbit-page-types";
import type { OrbitScanPlan } from "@/types";

type UseOrbitFlywheelScanOptions = {
  router: ReturnType<typeof import("next/navigation").useRouter>;
  searchParams: ReturnType<typeof import("next/navigation").useSearchParams>;
  highlightIdFromUrl: string | null;
  digestIdsFromUrl: string | null;
  sourceFromUrl: string | null;
  scanning: boolean;
  buildScanRequest: (
    targetIds: string[],
    scanSelection: boolean
  ) => OrbitScanRequest;
  runOrbitScan: (request: OrbitScanRequest) => Promise<{ plan: OrbitScanPlan } | null>;
  setReviewSession: Dispatch<SetStateAction<OrbitReviewSession>>;
};

export function useOrbitFlywheelScan(options: UseOrbitFlywheelScanOptions) {
  const {
    router,
    searchParams,
    highlightIdFromUrl,
    digestIdsFromUrl,
    sourceFromUrl,
    scanning,
    buildScanRequest,
    runOrbitScan,
    setReviewSession,
  } = options;

  const lastHandledHighlightKeyRef = useRef<string | null>(null);
  const lastHandledDigestKeyRef = useRef<string | null>(null);

  const clearConsumedReviewUrlParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const hadReviewIntent =
      params.has("highlightId") || params.has("digestIds") || params.has("source");

    if (!hadReviewIntent) return;

    params.delete("highlightId");
    params.delete("digestIds");
    params.delete("source");

    const nextQuery = params.toString();
    router.replace(nextQuery ? `/orbit?${nextQuery}` : "/orbit", {
      scroll: false,
    });
  }, [router, searchParams]);

  useEffect(() => {
    if (!digestIdsFromUrl) {
      lastHandledDigestKeyRef.current = null;
      return;
    }
    if (scanning) return;
    if (lastHandledDigestKeyRef.current === digestIdsFromUrl) return;

    const ids = digestIdsFromUrl
      .split(",")
      .filter(Boolean)
      .slice(0, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN);
    if (ids.length === 0) return;

    lastHandledDigestKeyRef.current = digestIdsFromUrl;
    const sessionStartPayload: { size: number; source?: string } = { size: ids.length };
    if (sourceFromUrl) sessionStartPayload.source = sourceFromUrl;

    queueMicrotask(() => {
      trackFlywheelEvent("digest.session_start", sessionStartPayload);
      void (async () => {
        const result = await runOrbitScan(buildScanRequest(ids, true));
        if (!result) return;
        setReviewSession((current) => ({
          open: true,
          focusBookmarkId: ids[0] ?? null,
          digestBookmarkIds: ids,
          source: sourceFromUrl,
          sessionId: current.sessionId + 1,
        }));
      })();
    });
  }, [
    digestIdsFromUrl,
    sourceFromUrl,
    scanning,
    buildScanRequest,
    runOrbitScan,
    setReviewSession,
  ]);

  useEffect(() => {
    if (!highlightIdFromUrl) {
      lastHandledHighlightKeyRef.current = null;
      return;
    }
    if (digestIdsFromUrl) return;
    if (scanning) return;
    if (lastHandledHighlightKeyRef.current === highlightIdFromUrl) return;

    lastHandledHighlightKeyRef.current = highlightIdFromUrl;

    queueMicrotask(() => {
      void (async () => {
        const result = await runOrbitScan(buildScanRequest([highlightIdFromUrl], true));
        if (!result) return;
        setReviewSession((current) => ({
          open: true,
          focusBookmarkId: highlightIdFromUrl,
          digestBookmarkIds: null,
          source: sourceFromUrl,
          sessionId: current.sessionId + 1,
        }));
      })();
    });
  }, [
    highlightIdFromUrl,
    digestIdsFromUrl,
    sourceFromUrl,
    scanning,
    buildScanRequest,
    runOrbitScan,
    setReviewSession,
  ]);

  return { clearConsumedReviewUrlParams };
}
