"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { orbitLibraryStatusSchema } from "@/lib/api-response-schemas";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import { invalidateOrbitApplyQueries } from "@/lib/query-invalidation";
import { toast } from "@/lib/toast";
import type { OrbitLibraryRunView, OrbitLibraryStatusPayload } from "@/types";

const STATUS_KEY = ["orbit", "library-classify"] as const;
const ENDPOINT = "/api/orbit/library-classify";
/** Progress poll while a run is live. */
const POLL_MS = 2_500;
/** Refresh the queue at most this often while tags land, so tagged rows leave. */
const QUEUE_REFRESH_MS = 8_000;
/** Bookmarks checked before the rate is steady enough for an ETA. */
const ETA_MIN_PROCESSED = 48;

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString()} ${value === 1 ? one : many}`;
}

function isLive(run: OrbitLibraryRunView | null | undefined) {
  return run?.status === "running" && !run.stalled;
}

/** Share of the run's starting queue that has been checked, 0–1. */
export function libraryRunProgress(run: OrbitLibraryRunView | null) {
  if (!run || run.total <= 0) return null;
  if (run.status === "completed") return 1;
  return Math.min(1, run.processed / run.total);
}

/** Time left at the pace so far, from server timestamps. Null until the pace is known. */
export function libraryRunRemainingMs(run: OrbitLibraryRunView | null) {
  if (!isLive(run) || !run || run.processed < ETA_MIN_PROCESSED) return null;
  const elapsed = Date.parse(run.updatedAt) - Date.parse(run.startedAt);
  if (!(elapsed > 0)) return null;
  const left = Math.max(0, run.total - run.processed);
  return (left * elapsed) / run.processed;
}

export function formatLibraryRunEta(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute left";
  if (minutes < 60) return `about ${minutes} min left`;
  const hours = Math.round(minutes / 6) / 10;
  return `about ${hours.toLocaleString()} hr left`;
}

/** One line of run status for the Orbit banner. */
export function libraryRunDetail(run: OrbitLibraryRunView) {
  const of = `${run.processed.toLocaleString()} of ${run.total.toLocaleString()}`;
  if (run.status === "failed") {
    return `${run.errorMessage ?? "Auto-tag stopped."} Stopped at ${of}; Resume picks up where it left off.`;
  }
  if (run.stalled) {
    return `Stopped responding at ${of}. Resume picks up where it left off.`;
  }
  if (!run.vocabulary) return "Getting the tag list ready…";
  if (run.processed === 0) {
    return `Starting on ${count(run.total, "bookmark", "bookmarks")}…`;
  }
  const remaining = libraryRunRemainingMs(run);
  return [
    `${of} checked`,
    `${run.applied.toLocaleString()} tagged`,
    remaining == null ? null : formatLibraryRunEta(remaining),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Closing message once a watched run ends. */
export function libraryRunOutcome(run: OrbitLibraryRunView): {
  tone: "success" | "info" | "error";
  message: string;
} {
  if (run.status === "failed") {
    return {
      tone: "error",
      message: run.errorMessage ?? "Auto-tag stopped unexpectedly.",
    };
  }
  if (run.status === "cancelled") {
    return {
      tone: "info",
      message:
        run.applied > 0
          ? `Auto-tag stopped. ${count(run.applied, "bookmark", "bookmarks")} tagged so far.`
          : "Auto-tag stopped.",
    };
  }
  if (run.applied === 0) {
    return {
      tone: "info",
      message:
        "Auto-tag finished with no confident matches. Scan can propose new tags.",
    };
  }
  const noMatch = Math.max(0, run.processed - run.applied - run.failed);
  return {
    tone: "success",
    message: [
      `Tagged ${count(run.applied, "bookmark", "bookmarks")}.`,
      noMatch > 0 ? `${noMatch.toLocaleString()} had no confident match and stay in Orbit.` : null,
      run.failed > 0
        ? `${run.failed.toLocaleString()} couldn't be checked; run auto-tag again to retry them.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Whole-queue auto-tag. The server owns the run, so progress is real, it
 * survives reloads, and a second click never starts a duplicate pass.
 */
export function useOrbitLibraryTag() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"start" | "stop" | null>(null);
  // Runs this tab saw running: only those get a closing toast.
  const watched = useRef(new Set<string>());
  const lastRefresh = useRef({ runId: "", applied: 0, at: 0 });

  const statusQuery = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => fetchJson(ENDPOINT, undefined, orbitLibraryStatusSchema),
    staleTime: 15_000,
    refetchInterval: (query) => (isLive(query.state.data?.run) ? POLL_MS : false),
  });

  const run = statusQuery.data?.run ?? null;

  useEffect(() => {
    if (!run) return;

    if (run.status === "running") {
      watched.current.add(run.id);
      const last = lastRefresh.current;
      if (last.runId !== run.id) {
        lastRefresh.current = { runId: run.id, applied: run.applied, at: Date.now() };
      } else if (run.applied > last.applied && Date.now() - last.at >= QUEUE_REFRESH_MS) {
        lastRefresh.current = { runId: run.id, applied: run.applied, at: Date.now() };
        void invalidateOrbitApplyQueries(queryClient);
      }
      return;
    }

    if (!watched.current.delete(run.id)) return;
    void invalidateOrbitApplyQueries(queryClient, { includeGraph: true });
    // A failure stays in the banner with Resume, so it needs no toast.
    if (run.status === "failed") return;
    const outcome = libraryRunOutcome(run);
    toast[outcome.tone](outcome.message);
  }, [queryClient, run]);

  const start = useCallback(async () => {
    if (pending) return;
    setPending("start");
    try {
      const result = await sendJson(ENDPOINT, {
        method: "POST",
        schema: orbitLibraryStatusSchema,
      });
      queryClient.setQueryData<OrbitLibraryStatusPayload>(STATUS_KEY, result);
      if (!result.run) {
        toast.message("Nothing to tag. Every bookmark in Orbit already has a tag.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Auto-tag could not start."
      );
    } finally {
      setPending(null);
    }
  }, [pending, queryClient]);

  const stop = useCallback(async () => {
    if (pending) return;
    setPending("stop");
    try {
      const result = await sendJson(ENDPOINT, {
        method: "DELETE",
        schema: orbitLibraryStatusSchema,
      });
      queryClient.setQueryData<OrbitLibraryStatusPayload>(STATUS_KEY, result);
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Auto-tag could not stop."
      );
    } finally {
      setPending(null);
    }
  }, [pending, queryClient]);

  // Running (live or stalled) or failed-but-resumable: the banner owns it.
  const activeRun =
    run?.status === "running" || run?.status === "failed" ? run : null;
  const failed = activeRun?.status === "failed";

  return {
    untaggedCount: statusQuery.data?.untaggedCount ?? null,
    /** The pass the banner shows: running, stalled, or failed and resumable. */
    run: activeRun,
    live: isLive(activeRun),
    stalled: Boolean(activeRun?.stalled),
    failed,
    /** Waiting on the user to Resume or dismiss. */
    paused: Boolean(activeRun?.stalled) || failed,
    progress: libraryRunProgress(activeRun),
    detail: activeRun ? libraryRunDetail(activeRun) : null,
    starting: pending === "start",
    stopping: pending === "stop",
    start,
    stop,
  };
}

export type OrbitLibraryTagHandle = ReturnType<typeof useOrbitLibraryTag>;
