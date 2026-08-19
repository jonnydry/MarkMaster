"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import { OrbitMapHoverCard } from "@/components/orbit/orbit-map-hover-card";
import { buildOrbitMapGraphIndexes } from "@/lib/orbit-map-graph-indexes";
import type { OrbitGraphNode, OrbitGraphPayload } from "@/types";

export type OrbitMapHoverHandler = (
  next: OrbitMapSelection | null,
  position?: { x: number; y: number }
) => void;

interface OrbitMapHoverOwnerProps {
  graph: OrbitGraphPayload | null | undefined;
  handlerRef: MutableRefObject<OrbitMapHoverHandler | null>;
}

/**
 * Bookmark hover card + intent timers. Owns its own state so pointer travel
 * does not re-render the map page facade.
 */
export function OrbitMapHoverOwner({
  graph,
  handlerRef,
}: OrbitMapHoverOwnerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 960, height: 640 });
  const [hoverCard, setHoverCard] = useState<{
    node: OrbitGraphNode;
    x: number;
    y: number;
    epoch: string;
  } | null>(null);
  const hoverIntentTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);

  const graphEpoch = `${graph?.scope ?? ""}:${graph?.generatedAt ?? ""}`;
  const graphIndexes = useMemo(
    () => buildOrbitMapGraphIndexes(graph),
    [graph]
  );

  useEffect(() => {
    const stage = wrapRef.current?.parentElement;
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
  }, [clearHoverTimers, graphEpoch]);

  const visibleHoverCard = hoverCard?.epoch === graphEpoch ? hoverCard : null;

  const handleHoverChange = useCallback<OrbitMapHoverHandler>(
    (next, position) => {
      clearHoverTimers();

      if (next && position && graphIndexes) {
        const node = graphIndexes.nodesById.get(next.id);
        if (node) {
          hoverIntentTimerRef.current = window.setTimeout(() => {
            setHoverCard({ node, x: position.x, y: position.y, epoch: graphEpoch });
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
    [clearHoverTimers, graphEpoch, graphIndexes]
  );

  useEffect(() => {
    handlerRef.current = handleHoverChange;
    return () => {
      if (handlerRef.current === handleHoverChange) {
        handlerRef.current = null;
      }
    };
  }, [handleHoverChange, handlerRef]);

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-20">
      {visibleHoverCard ? (
        <OrbitMapHoverCard
          node={visibleHoverCard.node}
          x={visibleHoverCard.x}
          y={visibleHoverCard.y}
          containerWidth={stageSize.width}
          containerHeight={stageSize.height}
        />
      ) : null}
    </div>
  );
}
