"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sendJson, FetchJsonError } from "@/lib/fetch-json";
import { useSyncStatus } from "@/hooks/use-sync-status";
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
  const [countdown, setCountdown] = useState<string>("");

  const { data: syncStatus, refetch: refetchSyncStatus, isError: syncStatusError } =
    useSyncStatus();

  const currentRun = syncStatus?.currentRun;
  const latestRun = syncStatus?.recentRuns[0] ?? null;
  const isRateLimited = rateLimitedUntil !== null;
  const isAnySyncRunning = syncing || Boolean(currentRun) || isRateLimited;

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
    onSyncStateChange?.(true);
    try {
      const data = await sendJson<{
        newBookmarks: number;
        updatedBookmarks: number;
        hitExisting: boolean;
        rateLimited: boolean;
      }>("/api/bookmarks/sync", { method: "POST" });

      if (data.rateLimited) {
        toast.warning(
          `Synced ${data.newBookmarks} new bookmarks. Rate limited — try again later.`
        );
      } else if (data.hitExisting && data.newBookmarks === 0) {
        toast.success("Already up to date.");
      } else if (data.hitExisting) {
        toast.success(`Synced ${data.newBookmarks} new bookmarks.`);
      } else {
        toast.success(
          `Synced ${data.newBookmarks} new, ${data.updatedBookmarks} updated bookmarks.`
        );
      }

      void refetchSyncStatus();
      onSyncComplete?.();
    } catch (error) {
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
      setSyncing(false);
      onSyncStateChange?.(false);
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
          onClick={handleSync}
          aria-label={buttonLabel}
          aria-busy={isAnySyncRunning}
          title={syncTitle}
          variant="highlight"
          disabled={isRateLimited}
          className="relative h-10 w-10 p-0 disabled:opacity-70"
        >
          <RefreshCw
            className={`size-4 shrink-0 ${isAnySyncRunning ? "animate-spin" : ""}`}
            aria-hidden
          />
          <span
            className={`absolute bottom-1 right-1 h-2 w-2 rounded-full ring-2 ring-sidebar ${statusDotClass}`}
            aria-hidden
          />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-1.5 border border-sidebar-border bg-transparent p-2">
      <Button
        type="button"
        onClick={handleSync}
        aria-busy={isAnySyncRunning}
        variant="highlight"
        disabled={isRateLimited}
        className="h-9 w-full gap-2 text-sm disabled:opacity-70"
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
          <p>Mirrors X bookmark folders into synced collections.</p>
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

function formatFailedSyncLabel(relative: string, errorMessage: string | null | undefined) {
  const base = `Last sync failed ${relative}`;
  const detail = errorMessage?.trim();
  if (!detail) return base;
  const maxLen = 72;
  const shortened =
    detail.length > maxLen ? `${detail.slice(0, maxLen - 1)}…` : detail;
  return `${base} · ${shortened}`;
}
