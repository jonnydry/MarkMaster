"use client";

import { Loader2, RotateCcw } from "lucide-react";

import {
  ToolbarSearchField,
  ToolbarSegmentControl,
} from "@/components/toolbar/toolbar-primitives";
import type { CollectionDetailSort } from "@/hooks/use-collection-detail-page";

const SORT_OPTIONS: ReadonlyArray<{
  value: CollectionDetailSort;
  label: string;
}> = [
  { value: "custom", label: "Custom" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Resurface" },
];

export function CollectionDetailControlBar({
  search,
  sort,
  isUpdating,
  onSearchChange,
  onSortChange,
}: {
  search: string;
  sort: CollectionDetailSort;
  isUpdating: boolean;
  onSearchChange: (value: string) => void;
  onSortChange: (value: CollectionDetailSort) => void;
}) {
  return (
    <div className="my-3 surface-veil p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <ToolbarSearchField
          value={search}
          onChange={onSearchChange}
          placeholder="Search this collection…"
          aria-label="Search bookmarks in this collection"
          maxWidthClassName="sm:max-w-lg"
        />
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <ToolbarSegmentControl
            value={sort}
            options={SORT_OPTIONS}
            onChange={onSortChange}
            aria-label="Collection order"
          />
          {isUpdating ? (
            <Loader2
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
              aria-label="Updating collection"
            />
          ) : null}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
        {sort === "oldest" ? (
          <>
            <RotateCcw className="size-3" aria-hidden="true" />
            Older saves are first so useful ideas can resurface.
          </>
        ) : sort === "newest" ? (
          "Most recently saved bookmarks are first."
        ) : (
          "Custom order is active; move controls remain available."
        )}
      </p>
    </div>
  );
}
