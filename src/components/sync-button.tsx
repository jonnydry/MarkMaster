"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import { toast } from "@/lib/toast";
import { sendJson, FetchJsonError } from "@/lib/fetch-json";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { findTerminalRunForId, isExpectedFinishedRun } from "@/lib/sync-client-completion";
import { TWITTER_PROVIDER_ID } from "@/lib/constants";
import type { SyncRunSummary } from "@/types";

interface SyncButtonProps {
  lastSyncAt: Date | null;
  onSyncComplete?: () => void;
  /** Shown in the status line after the sync message, e.g. " · 99 bookmarks". */
  bookmarkCount?: number;
  detail?: "compact" | "full";
  layout?: "panel" | "icon";
  onSyncStateChange?: (syncing: boolean) => void;
}

export function SyncButton({
  lastSyncAt,
  onSyncComplete,
  bookmarkCount,
  detail = "compact",
  layout = "panel",
  onSyncStateChange,
}: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const initiatedSyncRef = useRef(false);
  const pendingRunIdRef = useRef<string | null>(null);
  const notifiedRunIdsRef = useRef(new Set<string>());
  const lastProgressNewBookmarksRef = useRef(0);
  const previousCurrentRunRef = useRef<SyncRunSummary | null | undefined>(undefined);
  const [countdown, setCountdown] = useState<string>("");

  const { data: syncStatus, refetch: refetchSyncStatus, isError: syncStatusError } =
    useSyncStatus();

  const currentRun = syncStatus?.currentRun;
  const latestRun = syncStatus?.recentRuns[0] ?? null;
  const isRateLimited = rateLimitedUntil !== null;
  const isAnySyncRunning = syncing || Boolean(currentRun) || isRateLimited;
  // A 401/expired-token failure can't be retried — the X connection needs
  // re-authorizing. Surface a reconnect action instead of a Sync that re-fails.
  // Once the user has re-authorized (reauthorizedAt postdates the failed run),
  // the failed run is stale evidence: drop the prompt and offer Sync again.
  const failedRunEndedAt = latestRun
    ? Date.parse(latestRun.completedAt ?? latestRun.startedAt)
    : null;
  const reauthorizedAt = syncStatus?.reauthorizedAt
    ? Date.parse(syncStatus.reauthorizedAt)
    : null;
  const reauthorizedSinceFailure =
    reauthorizedAt !== null &&
    failedRunEndedAt !== null &&
    reauthorizedAt > failedRunEndedAt;
  const needsReconnect =
    !currentRun &&
    latestRun?.status === "FAILED" &&
    isReauthRequiredError(latestRun.errorMessage) &&
    !reauthorizedSinceFailure;

  const handleReconnect = () => {
    const callbackUrl =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/dashboard";
    void signIn(TWITTER_PROVIDER_ID, { callbackUrl });
  };

  useEffect(() => {
    if (!syncStatus || !initiatedSyncRef.current) return;

    const { currentRun, recentRuns } = syncStatus;
    const pendingRunId = pendingRunIdRef.current;

    if (
      pendingRunId &&
      currentRun?.id === pendingRunId &&
      currentRun.newBookmarks > lastProgressNewBookmarksRef.current
    ) {
      lastProgressNewBookmarksRef.current = currentRun.newBookmarks;
      onSyncComplete?.();
    }

    if (pendingRunId) {
      const finishedRun = findTerminalRunForId(recentRuns, pendingRunId);
      if (finishedRun) {
        pendingRunIdRef.current = null;
        initiatedSyncRef.current = false;
        lastProgressNewBookmarksRef.current = 0;
        if (!notifiedRunIdsRef.current.has(finishedRun.id)) {
          notifiedRunIdsRef.current.add(finishedRun.id);
          showSyncCompletionToast(finishedRun);
        }
        onSyncComplete?.();
        return;
      }
    }

    const previousRun = previousCurrentRunRef.current;
    previousCurrentRunRef.current = currentRun ?? null;

    if (previousRun && !currentRun && recentRuns[0]) {
      const finishedRun = recentRuns[0];
      if (
        !isExpectedFinishedRun(finishedRun, {
          pendingRunId,
          previousRunId: previousRun.id,
        })
      ) {
        return;
      }
      pendingRunIdRef.current = null;
      initiatedSyncRef.current = false;
      lastProgressNewBookmarksRef.current = 0;
      if (!notifiedRunIdsRef.current.has(finishedRun.id)) {
        notifiedRunIdsRef.current.add(finishedRun.id);
        showSyncCompletionToast(finishedRun);
      }
      onSyncComplete?.();
    }
  }, [syncStatus, onSyncComplete]);

  // Live countdown for rate limit
  useEffect(() => {
    if (!rateLimitedUntil) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((rateLimitedUntil - Date.now()) / 1000));

      if (remaining <= 0) {
        setRateLimitedUntil(null);
        setCountdown("");
        clearInterval(interval);
      } else {
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        setCountdown(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitedUntil]);

  const statusCopy = getSyncStatusCopy(currentRun, latestRun, lastSyncAt);

  const handleSync = async () => {
    if (isAnySyncRunning) return;
    setSyncing(true);
    initiatedSyncRef.current = true;
    onSyncStateChange?.(true);
    let pollForCompletion = false;
    try {
      const data = await sendJson<{
        accepted?: boolean;
        status?: string;
        runId?: string;
        newBookmarks?: number;
        updatedBookmarks?: number;
        hitExisting?: boolean;
        rateLimited?: boolean;
      }>("/api/bookmarks/sync", { method: "POST" });

      if (
        data.accepted ||
        data.status === "RUNNING" ||
        data.status === "PENDING"
      ) {
        if (data.runId) {
          pendingRunIdRef.current = data.runId;
        }
        pollForCompletion = true;
        setSyncing(false);
        onSyncStateChange?.(false);
        void refetchSyncStatus();
        return;
      }

      showSyncResultToast(data);
      initiatedSyncRef.current = false;
      pendingRunIdRef.current = null;
      void refetchSyncStatus();
      onSyncComplete?.();
    } catch (error) {
      if (error instanceof FetchJsonError && error.status === 409) {
        const body = error.body as Record<string, unknown> | null;
        const conflictRun = body?.currentRun as SyncRunSummary | undefined;
        if (conflictRun?.id) {
          pendingRunIdRef.current = conflictRun.id;
        }
        pollForCompletion = true;
        setSyncing(false);
        onSyncStateChange?.(false);
        void refetchSyncStatus();
        return;
      }

      if (error instanceof FetchJsonError && error.status === 429) {
        // Try to extract retry time from body or message
        const body = error.body as Record<string, unknown> | null;
        const retryAfter =
          (typeof body?.retryAfter === "number" ? body.retryAfter : undefined) ??
          parseInt(error.message.match(/(\d+)\s*seconds?/i)?.[1] || "60", 10);

        const until = Date.now() + retryAfter * 1000;
        setRateLimitedUntil(until);

        toast.error("Rate limit reached", {
          description: `Please wait ${Math.ceil(retryAfter / 60)} minute(s) before syncing again.`,
        });
        void refetchSyncStatus();
        onSyncComplete?.();
        return;
      }

      if (error instanceof Error) {
        toast.error(error.message || "Failed to sync bookmarks");
        return;
      }

      toast.error("Failed to sync bookmarks");
    } finally {
      if (!pollForCompletion) {
        setSyncing(false);
        onSyncStateChange?.(false);
      }
    }
  };

  const statusLabel = syncStatusError
    ? "Could not load sync status"
    : (statusCopy?.label ?? (lastSyncAt ? "Up to date" : "Not synced"));
  const statusDotClass = syncStatusError
    ? "bg-destructive"
    : (statusCopy?.dotClass ??
      (lastSyncAt ? "bg-emerald" : "bg-muted-foreground/40"));
  const buttonLabel = isRateLimited
    ? `Rate limited${countdown ? ` ${countdown}` : ""}`
    : isAnySyncRunning
      ? "Syncing bookmarks"
      : "Sync bookmarks";
  const bookmarkCountLabel =
    bookmarkCount !== undefined ? `${bookmarkCount.toLocaleString()} bookmarks` : null;
  const syncTitle = [buttonLabel, statusLabel, bookmarkCountLabel]
    .filter(Boolean)
    .join(" · ");

  if (layout === "icon") {
    return (
      <div className="flex justify-center">
        <Button
          type="button"
          onClick={needsReconnect ? handleReconnect : handleSync}
          aria-label={needsReconnect ? "Reconnect X" : buttonLabel}
          aria-busy={isAnySyncRunning}
          title={needsReconnect ? "Reconnect X — session expired" : syncTitle}
          variant="highlight"
          disabled={isRateLimited && !needsReconnect}
          className="highlight-search-shell relative h-10 w-10 overflow-hidden p-0 disabled:opacity-70"
        >
          {needsReconnect ? (
            <XLogoMark className="size-4 shrink-0" title={undefined} />
          ) : (
            <RefreshCw
              className={`size-4 shrink-0 ${isAnySyncRunning ? "animate-spin" : ""}`}
              aria-hidden
            />
          )}
          {/* absolute! — .highlight-search-shell > * forces position: relative
              on children; the status dot must stay corner-pinned. */}
          <span
            className={`absolute! bottom-1 right-1 h-2 w-2 rounded-full ring-2 ring-sidebar ${needsReconnect ? "bg-destructive" : statusDotClass}`}
            aria-hidden
          />
        </Button>
      </div>
    );
  }

  if (needsReconnect) {
    return (
      <div className="flex w-full shrink-0 flex-col gap-1.5 rounded-sm border border-destructive/30 bg-destructive/5 p-2">
        <Button
          type="button"
          onClick={handleReconnect}
          variant="highlight"
          className="highlight-search-shell relative h-9 w-full gap-2 overflow-hidden text-sm"
        >
          <XLogoMark className="size-4 shrink-0" title={undefined} />
          Reconnect X
        </Button>
        <div className="flex items-start gap-1.5 px-0.5" aria-live="polite">
          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="min-w-0 text-xs leading-snug text-destructive">
            X session expired — reconnect to resume syncing.
          </span>
        </div>
        {detail === "full" ? (
          <p className="mt-1 border-t border-hairline-soft pt-2 text-xs leading-snug text-muted-foreground">
            Your X access token was revoked or expired. Reconnecting re-authorizes
            read-only access and resumes syncing where it left off.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-1.5 rounded-sm border border-sidebar-border bg-transparent p-2">
      <Button
        type="button"
        onClick={handleSync}
        aria-busy={isAnySyncRunning}
        variant="highlight"
        disabled={isRateLimited}
        className="highlight-search-shell relative h-9 w-full gap-2 overflow-hidden text-sm disabled:opacity-70"
      >
        <RefreshCw
          className={`size-4 shrink-0 ${isAnySyncRunning ? "animate-spin" : ""}`}
        />
        {isRateLimited
          ? `Rate limited (${countdown})`
          : isAnySyncRunning
            ? "Syncing..."
            : "Sync"}
      </Button>

      {syncStatusError ? (
        <div className="flex items-center gap-1.5 px-0.5" aria-live="polite">
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="min-w-0 text-xs leading-snug text-destructive truncate">
            Could not load sync status
          </span>
        </div>
      ) : statusCopy ? (
        <div className="flex items-center gap-1.5 px-0.5" aria-live="polite">
          <div
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusCopy.dotClass}`}
          />
          <span className="min-w-0 text-xs leading-snug text-muted-foreground truncate">
            {statusCopy.label}
            {bookmarkCount !== undefined ? (
              <span className="text-muted-foreground/60">
                {" · "}
                {bookmarkCount.toLocaleString()} bookmarks
              </span>
            ) : null}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-0.5" aria-live="polite">
          <div
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${lastSyncAt ? "bg-emerald" : "bg-muted-foreground/40"}`}
          />
          <span className="text-xs text-muted-foreground">
            {lastSyncAt ? "Up to date" : "Not synced"}
          </span>
          {(lastSyncAt || bookmarkCount !== undefined) && (
            <span className="text-xs text-muted-foreground/60">
              {[
                lastSyncAt &&
                  `${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}`,
                bookmarkCount !== undefined &&
                  `${bookmarkCount.toLocaleString()} bookmarks`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
      )}
      {detail === "full" ? (
        <div className="mt-1 grid gap-1.5 border-t border-hairline-soft pt-2 text-xs leading-snug text-muted-foreground">
          <p>Fetches newest X bookmarks and updates existing saves.</p>
          <p>
            Enable X folder scanning in Settings to mirror bookmark folders into
            synced collections.
          </p>
          <p>Pauses safely on rate limits and resumes on the next sync.</p>
        </div>
      ) : null}
    </div>
  );
}

function getSyncStatusCopy(
  currentRun: SyncRunSummary | null | undefined,
  latestRun: SyncRunSummary | null | undefined,
  lastSyncAt: Date | null
) {
  if (currentRun) {
    return {
      dotClass: "bg-primary animate-pulse",
      label: `Syncing${currentRun.totalFetched > 0 ? ` · ${currentRun.totalFetched} fetched` : ""}...`,
    };
  }

  if (latestRun) {
    const completedAt = latestRun.completedAt || latestRun.startedAt;
    const relative = formatDistanceToNow(new Date(completedAt), {
      addSuffix: true,
    });

    if (latestRun.status === "FAILED") {
      return {
        dotClass: "bg-destructive",
        label: formatFailedSyncLabel(relative, latestRun.errorMessage),
      };
    }

    if (latestRun.status === "RATE_LIMITED") {
      return {
        dotClass: "bg-destructive",
        label: `Rate limited ${relative}${latestRun.resumeToken ? " · Sync again to continue" : ""}`,
      };
    }

    const parts: string[] = [];
    if (latestRun.newBookmarks > 0) parts.push(`${latestRun.newBookmarks} new`);
    if (latestRun.updatedBookmarks > 0) parts.push(`${latestRun.updatedBookmarks} updated`);
    const summary = parts.length > 0 ? parts.join(", ") : "Already up to date";
    const resumeNote = latestRun.resumeToken ? " · More to sync" : "";

    return {
      dotClass: latestRun.resumeToken ? "bg-note" : "bg-emerald",
      label: `${summary} ${relative}${resumeNote}`,
    };
  }

  if (lastSyncAt) {
    return {
      dotClass: "bg-emerald",
      label: formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true }),
    };
  }

  return null;
}

/**
 * True when a sync failure stems from an expired/revoked X token — a state that
 * retrying can't fix. Callers surface a reconnect (re-auth) action instead.
 */
function isReauthRequiredError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /\b401\b|unauthor|invalid[_ ]?grant|token (?:expired|revoked|invalid)|reconnect|re-?auth/i.test(
    message
  );
}

function formatFailedSyncLabel(relative: string, errorMessage: string | null | undefined) {
  const base = `Last sync failed ${relative}`;
  const detail = errorMessage?.trim();
  if (!detail) return base;
  const maxLen = 72;
  const shortened =
    detail.length > maxLen ? `${detail.slice(0, maxLen - 1)}…` : detail;
  return `${base} · ${shortened}`;
}

function showSyncResultToast(data: {
  newBookmarks?: number;
  updatedBookmarks?: number;
  hitExisting?: boolean;
  rateLimited?: boolean;
}) {
  const newBookmarks = data.newBookmarks ?? 0;
  const updatedBookmarks = data.updatedBookmarks ?? 0;

  if (data.rateLimited) {
    toast.warning(
      `Synced ${newBookmarks} new bookmarks. Rate limited — try again later.`
    );
    return;
  }

  if (data.hitExisting && newBookmarks === 0) {
    toast.success("Already up to date.");
    return;
  }

  if (data.hitExisting) {
    toast.success(`Synced ${newBookmarks} new bookmarks.`);
    return;
  }

  toast.success(`Synced ${newBookmarks} new, ${updatedBookmarks} updated bookmarks.`);
}

function showSyncCompletionToast(run: SyncRunSummary) {
  if (run.status === "FAILED") {
    toast.error(run.errorMessage?.trim() || "Sync failed");
    return;
  }

  showSyncResultToast({
    newBookmarks: run.newBookmarks,
    updatedBookmarks: run.updatedBookmarks,
    hitExisting: run.hitExisting,
    rateLimited: run.status === "RATE_LIMITED" || run.rateLimited,
  });
}
