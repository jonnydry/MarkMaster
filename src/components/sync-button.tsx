"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import type { SyncRunSummary, SyncStatusResponse } from "@/types";

interface SyncButtonProps {
  lastSyncAt: Date | null;
  onSyncComplete?: () => void;
  /** Shown in the status line after the sync message, e.g. " · 99 bookmarks". */
  bookmarkCount?: number;
}

export function SyncButton({ lastSyncAt, onSyncComplete, bookmarkCount }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const { data: syncStatus, refetch: refetchSyncStatus, isError: syncStatusError } =
    useQuery<SyncStatusResponse>({
      queryKey: ["sync-status"],
      queryFn: () => fetchJson("/api/bookmarks/sync"),
      refetchInterval: (query) => (query.state.data?.currentRun ? 5000 : false),
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    });

  const currentRun = syncStatus?.currentRun;
  const latestRun = syncStatus?.recentRuns[0] ?? null;
  const isAnySyncRunning = syncing || Boolean(currentRun);

  const statusCopy = getSyncStatusCopy(currentRun, latestRun, lastSyncAt);

  const handleSync = async () => {
    setSyncing(true);
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
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to sync bookmarks";
      toast.error(message || "Failed to sync bookmarks");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex w-full shrink-0 flex-col gap-1.5 rounded-xl border border-hairline-soft bg-surface-2 p-2 shadow-sm">
      <Button
        type="button"
        onClick={handleSync}
        disabled={isAnySyncRunning}
        className="h-8 w-full gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 shrink-0 ${isAnySyncRunning ? "animate-spin" : ""}`}
        />
        {isAnySyncRunning ? "Syncing..." : "Sync"}
      </Button>

      {syncStatusError ? (
        <div className="flex items-center gap-1.5 px-0.5">
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="min-w-0 text-[11px] leading-snug text-destructive truncate">
            Could not load sync status
          </span>
        </div>
      ) : statusCopy ? (
        <div className="flex items-center gap-1.5 px-0.5">
          <div
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusCopy.dotClass}`}
          />
          <span className="min-w-0 text-[11px] leading-snug text-muted-foreground truncate">
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
        <div className="flex items-center gap-1.5 px-0.5">
          <div
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${lastSyncAt ? "bg-success" : "bg-muted-foreground/40"}`}
          />
          <span className="text-[11px] text-muted-foreground">
            {lastSyncAt ? "Up to date" : "Not synced"}
          </span>
          {(lastSyncAt || bookmarkCount !== undefined) && (
            <span className="text-[11px] text-muted-foreground/60">
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
      dotClass: "bg-chart-2 animate-pulse",
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
        dotClass: "bg-chart-2",
        label: `Rate limited ${relative}${latestRun.resumeToken ? " · Sync again to continue" : ""}`,
      };
    }

    const parts: string[] = [];
    if (latestRun.newBookmarks > 0) parts.push(`${latestRun.newBookmarks} new`);
    if (latestRun.updatedBookmarks > 0) parts.push(`${latestRun.updatedBookmarks} updated`);
    const summary = parts.length > 0 ? parts.join(", ") : "Already up to date";
    const resumeNote = latestRun.resumeToken ? " · More to sync" : "";

    return {
      dotClass: latestRun.resumeToken ? "bg-chart-2" : "bg-primary",
      label: `${summary} ${relative}${resumeNote}`,
    };
  }

  if (lastSyncAt) {
    return {
      dotClass: "bg-primary",
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
