"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { OrbitMiniMap } from "@/components/orbit/orbit-mini-map";
import type { OrbitDecision, OrbitGraphPayload } from "@/types";

interface OrbitMapDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: OrbitGraphPayload | null | undefined;
  loading: boolean;
  focusedBookmarkId: string | null;
  primaryDecision: OrbitDecision | null;
  onSelectBookmark?: (bookmarkId: string) => void;
}

export function OrbitMapDrawer({
  open,
  onOpenChange,
  graph,
  loading,
  focusedBookmarkId,
  primaryDecision,
  onSelectBookmark,
}: OrbitMapDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full max-w-none flex-col gap-0 border-l border-white/10 bg-[#05080f] p-2 text-white sm:max-w-[520px] md:max-w-[560px]"
        aria-label="Live orbit map"
      >
        <OrbitMiniMap
          graph={graph}
          loading={loading}
          focusedBookmarkId={focusedBookmarkId}
          primaryDecision={primaryDecision}
          onSelectBookmark={onSelectBookmark}
          className="h-full min-h-0 flex-1"
        />
      </SheetContent>
    </Sheet>
  );
}
