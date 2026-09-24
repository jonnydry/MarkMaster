"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { orbitLibraryClassifyQueueSchema, orbitLibraryClassifyResultSchema } from "@/lib/api-response-schemas";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import { invalidateOrbitApplyQueries } from "@/lib/query-invalidation";
import { toast } from "@/lib/toast";

const QUEUE_KEY = ["orbit", "library-classify-queue"] as const;
const REFRESH_MS = 15_000;
/** Stop watching after this many unchanged polls. The worker keeps going if it is still mid-page. */
const QUIET_POLLS = 12;

export function libraryTagProgressLabel(
  active: boolean,
  tagged: number | null,
  left: number | null
) {
  if (!active) return null;
  if (left == null) return "Tagging the library";
  if (tagged != null && tagged > 0) {
    return `Tagging the library · ${tagged.toLocaleString()} tagged · ${left.toLocaleString()} still untagged`;
  }
  return `Tagging the library · ${left.toLocaleString()} still untagged`;
}

export function useOrbitLibraryTag() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const [startedFrom, setStartedFrom] = useState<number | null>(null);
  const seen = useRef<number | null>(null);
  const unchanged = useRef(0);

  const queueQuery = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () =>
      fetchJson(
        "/api/orbit/library-classify",
        undefined,
        orbitLibraryClassifyQueueSchema
      ),
    staleTime: 15_000,
    refetchInterval: watching ? REFRESH_MS : false,
  });

  const count =
    typeof queueQuery.data?.untaggedCount === "number"
      ? queueQuery.data.untaggedCount
      : null;

  useEffect(() => {
    if (!watching || count == null) return;

    if (seen.current == null) {
      seen.current = count;
      return;
    }

    if (count < seen.current) {
      seen.current = count;
      unchanged.current = 0;
      void invalidateOrbitApplyQueries(queryClient);
      return;
    }

    unchanged.current += 1;
    if (count !== 0 && unchanged.current < QUIET_POLLS) return;

    const remaining = count;
    const timer = window.setTimeout(() => {
      setWatching(false);
      setBusy(false);
      toast.success(
        remaining === 0
          ? "The library is tagged."
          : `${remaining.toLocaleString()} bookmarks still have no tag.`
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [count, queryClient, queueQuery.dataUpdatedAt, watching]);

  const start = async () => {
    if (busy || watching) return;
    setStartedFrom(count);
    setBusy(true);
    try {
      const result = await sendJson("/api/orbit/library-classify", {
        method: "POST",
        body: {},
        schema: orbitLibraryClassifyResultSchema,
      });
      await invalidateOrbitApplyQueries(queryClient, { includeGraph: true });
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
      if (result.continued && result.remaining > 0) {
        seen.current = null;
        unchanged.current = 0;
        setWatching(true);
        toast.success("Tagging the library. Tags show up as they land.");
        return;
      }
      setBusy(false);
      const stillUntagged = result.skippedReview + result.remaining;
      toast.success(
        stillUntagged === 0
          ? `Tagged ${result.applied.toLocaleString()} bookmarks.`
          : `Tagged ${result.applied.toLocaleString()} · ${stillUntagged.toLocaleString()} still untagged.`
      );
    } catch (error) {
      setBusy(false);
      setWatching(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Tagging the library could not start."
      );
    }
  };

  const active = busy || watching;
  const tagged =
    startedFrom != null && count != null ? Math.max(0, startedFrom - count) : null;

  return {
    count,
    busy: active,
    status: libraryTagProgressLabel(active, tagged, active ? count : null),
    start,
  };
}
