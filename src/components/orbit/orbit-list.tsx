"use client";

import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

import { OrbitListRow } from "./orbit-list-row";

/**
 * OrbitList
 *
 * Clean, high-density container for the new Orbit triage queue.
 * Matches the visual language and density of Paper artboard 6U-0.
 *
 * This is the primary surface for the new slide-in + overlays model.
 */

interface OrbitListProps {
  bookmarks: BookmarkWithRelations[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onQuickAction?: (id: string, action: string, event?: React.MouseEvent) => void;
  className?: string;
  isLoading?: boolean;
}

export function OrbitList({
  bookmarks,
  selectedId,
  onSelect,
  onQuickAction,
  className,
  isLoading,
}: OrbitListProps) {
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-primary/50">
        Loading queue…
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center text-center text-primary/50">
        <div className="mb-1 text-[13px]">Queue is clear</div>
        <div className="text-[11px] text-primary/35">All caught up. New bookmarks will appear here.</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {bookmarks.map((bookmark) => (
        <OrbitListRow
          key={bookmark.id}
          bookmark={bookmark}
          selected={selectedId === bookmark.id}
          onSelect={onSelect}
          onQuickAction={onQuickAction}
        />
      ))}
    </div>
  );
}
