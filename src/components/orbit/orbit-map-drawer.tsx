"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { OrbitMiniMap } from "@/components/orbit/orbit-mini-map";
import type { OrbitDecision, OrbitGraphPayload } from "@/types";
import { cn } from "@/lib/utils";

import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";

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
  const { isOrbital } = useOrbitalTheme();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex w-full max-w-none flex-col gap-0 p-2 text-white sm:max-w-[520px] md:max-w-[560px]",
          isOrbital
            ? cn(orbital.glass, "border-l border-primary/20 bg-[#05080f]/90")
            : "border-l border-white/10 bg-[#05080f]"
        )}
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
