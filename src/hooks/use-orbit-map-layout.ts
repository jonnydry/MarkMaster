"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import {
  type BookmarkGraphNode,
  type OrbitMapGraphIndexes,
} from "@/lib/orbit-map-graph-indexes";
import { saveOrbitMapPositions } from "@/lib/orbit-map-layout-storage";
import type { OrbitGraphScope } from "@/types";

type PendingLayoutSave = {
  scope: OrbitGraphScope;
  positions: Record<string, { x: number; y: number }>;
};

export function useOrbitMapLayout(graphScope: OrbitGraphScope) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 960, height: 640 });
  const [hoverCard, setHoverCard] = useState<{
    node: BookmarkGraphNode;
    x: number;
    y: number;
  } | null>(null);
  const hoverIntentTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);
  const layoutSaveTimerRef = useRef<number | null>(null);
  const pendingLayoutSaveRef = useRef<PendingLayoutSave | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      setStageSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const clearHoverTimers = useCallback(() => {
    if (hoverIntentTimerRef.current !== null) {
      window.clearTimeout(hoverIntentTimerRef.current);
      hoverIntentTimerRef.current = null;
    }
    if (hoverClearTimerRef.current !== null) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearHoverTimers();
  }, [clearHoverTimers]);

  const flushPendingLayoutSave = useCallback(() => {
    if (layoutSaveTimerRef.current !== null) {
      window.clearTimeout(layoutSaveTimerRef.current);
      layoutSaveTimerRef.current = null;
    }

    const pending = pendingLayoutSaveRef.current;
    if (!pending) return;
    saveOrbitMapPositions(pending.positions, pending.scope);
    pendingLayoutSaveRef.current = null;
  }, []);

  useEffect(() => {
    return () => flushPendingLayoutSave();
  }, [flushPendingLayoutSave]);

  const resetHover = useCallback(() => {
    clearHoverTimers();
    setHoverCard(null);
  }, [clearHoverTimers]);

  const handleLayoutUpdated = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      pendingLayoutSaveRef.current = { positions, scope: graphScope };
      if (layoutSaveTimerRef.current !== null) return;

      layoutSaveTimerRef.current = window.setTimeout(flushPendingLayoutSave, 500);
    },
    [flushPendingLayoutSave, graphScope]
  );

  const handleHoverChange = useCallback(
    (
      next: OrbitMapSelection | null,
      position: { x: number; y: number } | undefined,
      graphIndexes: OrbitMapGraphIndexes | null
    ) => {
      clearHoverTimers();

      if (next?.kind === "bookmark" && position && graphIndexes) {
        const node = graphIndexes.bookmarksById.get(next.id);
        if (node) {
          hoverIntentTimerRef.current = window.setTimeout(() => {
            setHoverCard({ node, x: position.x, y: position.y });
            hoverIntentTimerRef.current = null;
          }, 140);
          return;
        }
      }

      hoverClearTimerRef.current = window.setTimeout(() => {
        setHoverCard(null);
        hoverClearTimerRef.current = null;
      }, 140);
    },
    [clearHoverTimers]
  );

  return {
    stageRef,
    stageSize,
    hoverCard,
    handleLayoutUpdated,
    handleHoverChange,
    flushPendingLayoutSave,
    resetHover,
  };
}
