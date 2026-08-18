"use client";

import React, { useEffect, useRef } from "react";

import { useTheme } from "@/components/providers";
import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import type { CameraState } from "@/lib/orbit-worker-protocol";
import type { OrbitGraphPayload } from "@/types";

const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 112;
const MINIMAP_PADDING = 8;

const CORE_COLOR = "#facc15";
const TAG_FALLBACK_COLOR = "#34d399";
const USER_COLLECTION_COLOR = "#f472b6";
const X_FOLDER_COLOR = "#a78bfa";

/**
 * Hub-level rendering (matches the map's far LOD band): the minimap reads as
 * a topic overview — one colored dot per hub, sized by bookmark count —
 * instead of replicating every bookmark as noise.
 */
function getHubStyle(
  node: OrbitGraphPayload["nodes"][number]
): { color: string; radius: number } | null {
  switch (node.kind) {
    case "core":
      return { color: CORE_COLOR, radius: 2.5 };
    case "tag":
      return {
        color: node.color || TAG_FALLBACK_COLOR,
        radius: 1.6 + Math.min(2.6, Math.sqrt(Math.max(0, node.count)) * 0.34),
      };
    case "collection":
      return {
        color:
          node.variant === "x_folder" ? X_FOLDER_COLOR : USER_COLLECTION_COLOR,
        radius: 1.6 + Math.min(2.6, Math.sqrt(Math.max(0, node.count)) * 0.34),
      };
    case "bookmark":
    case "overflow":
      return null;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

interface MinimapTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface OrbitMapMinimapProps {
  graph: OrbitGraphPayload;
  /** Latest known world positions, keyed by node id. */
  positions: Record<string, { x: number; y: number }>;
  /** Bumped whenever positions are refreshed so the canvas redraws. */
  layoutVersion: number;
  camera: CameraState | null;
  /** CSS pixel size of the main map canvas (for the viewport rectangle). */
  viewport: { width: number; height: number } | null;
  onJump: (worldX: number, worldY: number) => void;
  className?: string;
}

export function OrbitMapMinimap({
  graph,
  positions,
  layoutVersion,
  camera,
  viewport,
  onJump,
  className,
}: OrbitMapMinimapProps) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<MinimapTransform | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // World bounds of all positioned nodes in this graph
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      const position = positions[node.id];
      if (!position) continue;
      if (position.x < minX) minX = position.x;
      if (position.y < minY) minY = position.y;
      if (position.x > maxX) maxX = position.x;
      if (position.y > maxY) maxY = position.y;
    }
    if (!Number.isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) {
      transformRef.current = null;
      return;
    }

    const scale = Math.min(
      (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / (maxX - minX),
      (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / (maxY - minY)
    );
    const offsetX =
      (MINIMAP_WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY =
      (MINIMAP_HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;
    transformRef.current = { scale, offsetX, offsetY };

    for (const node of graph.nodes) {
      const position = positions[node.id];
      if (!position) continue;
      const style = getHubStyle(node);
      if (!style) continue;
      const x = position.x * scale + offsetX;
      const y = position.y * scale + offsetY;

      // Soft halo so big topics read at a glance, then the hub dot itself.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(x, y, style.radius * 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(x, y, style.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle (visible world rect of the main canvas)
    if (camera && viewport && camera.zoom > 0) {
      const worldLeft = -camera.x / camera.zoom;
      const worldTop = -camera.y / camera.zoom;
      const worldWidth = viewport.width / camera.zoom;
      const worldHeight = viewport.height / camera.zoom;

      ctx.strokeStyle =
        theme === "dark"
          ? "rgba(226,232,240,0.85)"
          : "rgba(15,23,42,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        worldLeft * scale + offsetX,
        worldTop * scale + offsetY,
        worldWidth * scale,
        worldHeight * scale
      );
    }
  }, [graph, positions, layoutVersion, camera, viewport, theme]);

  const jumpToEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const transform = transformRef.current;
    const canvas = canvasRef.current;
    if (!transform || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onJump(
      (x - transform.offsetX) / transform.scale,
      (y - transform.offsetY) / transform.scale
    );
  };

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label="Graph minimap. Click or drag to move the view."
      onPointerDown={(event) => {
        event.stopPropagation();
        jumpToEvent(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons & 1) jumpToEvent(event);
      }}
      className={cn(
        orbitMapFloatingShellClass(),
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        className
      )}
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
    />
  );
}
