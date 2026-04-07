"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface SyncButtonProps {
  lastSyncAt: Date | null;
  onSyncComplete?: () => void;
}

export function SyncButton({ lastSyncAt, onSyncComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/bookmarks/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Sync failed");
        return;
      }

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

      onSyncComplete?.();
    } catch {
      toast.error("Failed to sync bookmarks");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      <Button
        onClick={handleSync}
        disabled={syncing}
        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-semibold h-8 px-3.5 rounded-lg"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
        />
        {syncing ? "Syncing..." : "Sync"}
      </Button>
      {lastSyncAt && (
        <div className="flex items-center gap-1.5">
          <div className="w-[5px] h-[5px] rounded-full bg-primary" />
          <span className="text-[11px] text-zinc-600">
            {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}
          </span>
        </div>
      )}
    </div>
  );
}
