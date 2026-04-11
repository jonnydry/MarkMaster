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
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<SyncStatusResponse>({
    queryKey: ["sync-status"],
    queryFn: () => fetchJson("/api/bookmarks/sync"),
    refetchInterval: (query) => (query.state.data?.currentRun ? 5000 : false),
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
      toast.error(error instanceof Error ? error.message : "Failed to sync bookmarks");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="w-full shrink-0 rounded-xl border border-border/60 bg-card/35 p-3.5 backdrop-blur-md flex flex-col gap-3">
      <Button
        type="button"
        onClick={handleSync}
        disabled={isAnySyncRunning}
        className="h-9 w-full gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 shrink-0 ${isAnySyncRunning ? "animate-spin" : ""}`}
        />
        {isAnySyncRunning ? "Syncing..." : "Sync"}
      </Button>

      {statusCopy ? (
        <div className="flex items-start gap-2">
          <div
            className={`mt-0.5 h-[5px] w-[5px] shrink-0 rounded-full ${statusCopy.dotClass}`}
          />
          <span className="min-w-0 text-[11px] leading-snug text-muted-foreground">
            {statusCopy.label}
            {bookmarkCount !== undefined ? (
              <span className="text-muted-foreground/80">
                {" · "}
                {bookmarkCount.toLocaleString()} bookmarks
              </span>
            ) : null}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${lastSyncAt ? "bg-success" : "bg-muted-foreground/40"}`}
            />
            <span className="text-xs text-muted-foreground">
              {lastSyncAt ? "Up to date" : "Not synced"}
            </span>
          </div>
          {(lastSyncAt || bookmarkCount !== undefined) && (
            <div className="text-[11px] text-muted-foreground/60">
              {[
                lastSyncAt &&
                  `Last sync ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}`,
                bookmarkCount !== undefined &&
                  `${bookmarkCount.toLocaleString()} bookmarks`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </>
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
      dotClass: "bg-amber-500",
      label: `Sync started ${formatDistanceToNow(new Date(currentRun.startedAt), {
        addSuffix: true,
      })}`,
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
        label: `Last sync failed ${relative}`,
      };
    }

    if (latestRun.status === "RATE_LIMITED") {
      return {
        dotClass: "bg-amber-500",
        label: `Last sync ${relative}: ${latestRun.newBookmarks} new, rate limited`,
      };
    }

    return {
      dotClass: "bg-primary",
      label:
        latestRun.newBookmarks === 0 && latestRun.updatedBookmarks === 0
          ? `Already up to date ${relative}`
          : `Last sync ${relative}: ${latestRun.newBookmarks} new, ${latestRun.updatedBookmarks} updated`,
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
