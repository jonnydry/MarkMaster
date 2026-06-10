"use client";

import React, { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { CameraState } from "@/lib/orbit-worker-protocol";
import type { OrbitGraphPayload } from "@/types";

const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 112;
const MINIMAP_PADDING = 8;

const KIND_COLORS: Record<string, string> = {
  bookmark: "rgba(148,163,184,0.55)",
  tag: "rgba(52,211,153,0.9)",
  collection: "rgba(244,114,182,0.9)",
  core: "rgba(250,204,21,0.95)",
  overflow: "rgba(249,115,22,0.85)",
};

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
      const x = position.x * scale + offsetX;
      const y = position.y * scale + offsetY;
      const isHub =
        node.kind === "tag" || node.kind === "collection" || node.kind === "core";
      ctx.fillStyle = KIND_COLORS[node.kind] ?? KIND_COLORS.bookmark;
      ctx.beginPath();
      ctx.arc(x, y, isHub ? 2 : 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rectangle (visible world rect of the main canvas)
    if (camera && viewport && camera.zoom > 0) {
      const worldLeft = -camera.x / camera.zoom;
      const worldTop = -camera.y / camera.zoom;
      const worldWidth = viewport.width / camera.zoom;
      const worldHeight = viewport.height / camera.zoom;

      ctx.strokeStyle = "rgba(226,232,240,0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        worldLeft * scale + offsetX,
        worldTop * scale + offsetY,
        worldWidth * scale,
        worldHeight * scale
      );
    }
  }, [graph, positions, layoutVersion, camera, viewport]);

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
      role="button"
      aria-label="Graph minimap — click to move the view"
      onPointerDown={(event) => {
        event.stopPropagation();
        jumpToEvent(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons & 1) jumpToEvent(event);
      }}
      className={cn(
        "cursor-pointer rounded-sm border border-white/[0.08] bg-black/55 backdrop-blur-xl",
        className
      )}
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
    />
  );
}
