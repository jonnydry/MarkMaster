"use client";

import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

import { OrbitListRow } from "./orbit-list-row";

interface OrbitListProps {
  bookmarks: BookmarkWithRelations[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onQuickAction?: (id: string, action: string, event?: React.MouseEvent) => void;
  className?: string;
  isLoading?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function OrbitList({
  bookmarks,
  selectedId,
  onSelect,
  onQuickAction,
  className,
  isLoading,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
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
          selectionMode={selectionMode}
          bulkSelected={selectedIds?.has(bookmark.id) ?? false}
          onSelect={onSelect}
          onToggleSelect={onToggleSelect}
          onQuickAction={onQuickAction}
        />
      ))}
    </div>
  );
}
