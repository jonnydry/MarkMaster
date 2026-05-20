"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";

import { OrbitMapCanvas } from "@/components/orbit/orbit-map-canvas"; // legacy component
import type {
  OrbitMapCanvasHandle,
  OrbitMapFocus,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import { cn } from "@/lib/utils";
import type { OrbitDecision, OrbitGraphPayload } from "@/types";
import { orbital } from "@/components/orbital";

interface OrbitMiniMapProps {
  graph: OrbitGraphPayload | null | undefined;
  loading: boolean;
  focusedBookmarkId: string | null;
  primaryDecision: OrbitDecision | null;
  onSelectBookmark?: (bookmarkId: string) => void;
  className?: string;
}

export function OrbitMiniMap({
  graph,
  loading,
  focusedBookmarkId,
  primaryDecision,
  onSelectBookmark,
  className,
}: OrbitMiniMapProps) {
  const canvasRef = useRef<OrbitMapCanvasHandle | null>(null);

  const predictedAnchorId = useMemo(() => {
    if (!graph || !primaryDecision) return null;
    const normalized = primaryDecision.label.trim().toLowerCase();
    const match = graph.nodes.find((node) => {
      if (primaryDecision.kind === "collection" && node.kind === "collection") {
        return node.name.toLowerCase() === normalized;
      }
      if (primaryDecision.kind === "tag" && node.kind === "tag") {
        return node.name.toLowerCase() === normalized;
      }
      return false;
    });
    return match?.id ?? null;
  }, [graph, primaryDecision]);

  const focus: OrbitMapFocus | null = useMemo(() => {
    if (!focusedBookmarkId || !predictedAnchorId) return null;
    return {
      bookmarkId: focusedBookmarkId,
      predictedAnchorId,
    };
  }, [focusedBookmarkId, predictedAnchorId]);

  const deepLink = focusedBookmarkId
    ? predictedAnchorId
      ? `/orbit/map?focus=${focusedBookmarkId}&anchor=${predictedAnchorId}`
      : `/orbit/map?focus=${focusedBookmarkId}`
    : "/orbit/map";

  const handleSelectionChange = (selection: OrbitMapSelection | null) => {
    if (!selection) return;
    if (selection.kind === "bookmark") {
      onSelectBookmark?.(selection.id);
    }
  };

  return (
    <section
      className={cn(
        orbital.glass,
        "relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-sm",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <p className={cn(orbital.label, "text-primary/70")}>
            Live orbit map
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">
            Predicted destinations pulse as you browse
          </h3>
        </div>
        <Link
          href={deepLink}
          className={cn(orbital.pill, "rounded-full px-3 py-1 text-primary/85 hover:bg-primary/10")}
        >
          Open graph mode
          <ArrowUpRight className="size-3.5" />
        </Link>
      </header>

      <div className="relative flex-1 min-h-0">
        {loading && !graph ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : graph ? (
          <OrbitMapCanvas
            ref={canvasRef}
            data={graph}
            selection={
              focusedBookmarkId
                ? { kind: "bookmark", id: focusedBookmarkId }
                : null
            }
            onSelectionChange={handleSelectionChange}
            focus={focus}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            No map data yet. Save a few bookmarks and refresh.
          </div>
        )}
      </div>

      {primaryDecision && predictedAnchorId && (
        <footer className={cn(orbital.label, "border-t border-primary/10 px-5 py-3 text-primary/60")}>
          Destination · {primaryDecision.label}
        </footer>
      )}
    </section>
  );
}
