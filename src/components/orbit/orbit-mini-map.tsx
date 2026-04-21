"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";

import {
  OrbitMapCanvas,
  type OrbitMapCanvasHandle,
  type OrbitMapFocus,
  type OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas";
import { cn } from "@/lib/utils";
import type { OrbitDecision, OrbitGraphPayload } from "@/types";

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
        "relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(56,189,248,0.12),transparent_55%),linear-gradient(180deg,rgba(10,15,29,0.97),rgba(6,10,23,0.92))] shadow-xl",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <p
            className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80"
            style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
          >
            Live orbit map
          </p>
          <h3 className="mt-1 text-sm font-semibold text-white">
            Predicted destinations pulse as you browse
          </h3>
        </div>
        <Link
          href={deepLink}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/10"
        >
          Open graph mode
          <ArrowUpRight className="size-3.5" />
        </Link>
      </header>

      <div className="relative flex-1 min-h-0">
        {loading && !graph ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-white/60" />
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
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/60">
            No map data yet. Save a few bookmarks and refresh.
          </div>
        )}
      </div>

      {primaryDecision && predictedAnchorId && (
        <footer
          className="border-t border-white/8 px-5 py-3 text-[11px] uppercase tracking-[0.22em] text-white/55"
          style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
        >
          Destination · {primaryDecision.label}
        </footer>
      )}
    </section>
  );
}
