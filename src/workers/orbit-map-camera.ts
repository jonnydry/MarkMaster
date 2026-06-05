import type { CameraState } from "@/lib/orbit-worker-protocol";

export interface OrbitMapCameraNode {
  x?: number;
  y?: number;
  radius: number;
}

export interface OrbitMapGraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface OrbitMapCameraConfig {
  minZoom: number;
  maxZoom: number;
  maxFitZoom: number;
  framePadding: number;
  nodePadding: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function getOrbitMapGraphBounds(
  nodes: OrbitMapCameraNode[],
  nodePadding: number
): OrbitMapGraphBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    if (typeof node.x !== "number" || typeof node.y !== "number") continue;
    const pad = node.radius + nodePadding;
    minX = Math.min(minX, node.x - pad);
    maxX = Math.max(maxX, node.x + pad);
    minY = Math.min(minY, node.y - pad);
    maxY = Math.max(maxY, node.y + pad);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

export function getOrbitMapFitZoom(
  bounds: OrbitMapGraphBounds,
  config: OrbitMapCameraConfig
) {
  const availableWidth = Math.max(
    config.viewportWidth - config.framePadding * 2,
    160
  );
  const availableHeight = Math.max(
    config.viewportHeight - config.framePadding * 2,
    160
  );
  const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);

  return Math.max(
    config.minZoom,
    Math.min(
      config.maxFitZoom,
      Math.min(availableWidth / graphWidth, availableHeight / graphHeight)
    )
  );
}

export function getOrbitMapMinimumZoom(
  bounds: OrbitMapGraphBounds | null,
  config: OrbitMapCameraConfig
) {
  return Math.min(
    config.maxZoom,
    bounds ? getOrbitMapFitZoom(bounds, config) : config.minZoom
  );
}

export function clampOrbitMapZoom(
  nextZoom: number,
  bounds: OrbitMapGraphBounds | null,
  config: OrbitMapCameraConfig
) {
  return Math.max(
    getOrbitMapMinimumZoom(bounds, config),
    Math.min(config.maxZoom, nextZoom)
  );
}

export function constrainOrbitMapCameraState(
  nextCamera: CameraState,
  bounds: OrbitMapGraphBounds | null,
  config: OrbitMapCameraConfig
): CameraState {
  if (!bounds) {
    return {
      x: nextCamera.x,
      y: nextCamera.y,
      zoom: Math.max(config.minZoom, Math.min(config.maxZoom, nextCamera.zoom)),
    };
  }

  const zoom = clampOrbitMapZoom(nextCamera.zoom, bounds, config);
  let x = nextCamera.x;
  let y = nextCamera.y;

  const graphScreenWidth = (bounds.maxX - bounds.minX) * zoom;
  const graphScreenHeight = (bounds.maxY - bounds.minY) * zoom;
  const availableWidth = Math.max(
    config.viewportWidth - config.framePadding * 2,
    160
  );
  const availableHeight = Math.max(
    config.viewportHeight - config.framePadding * 2,
    160
  );

  if (graphScreenWidth <= availableWidth) {
    x = config.viewportWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom;
  } else {
    const left = x + bounds.minX * zoom;
    const right = x + bounds.maxX * zoom;
    if (left > config.framePadding) {
      x = config.framePadding - bounds.minX * zoom;
    } else if (right < config.viewportWidth - config.framePadding) {
      x = config.viewportWidth - config.framePadding - bounds.maxX * zoom;
    }
  }

  if (graphScreenHeight <= availableHeight) {
    y = config.viewportHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom;
  } else {
    const top = y + bounds.minY * zoom;
    const bottom = y + bounds.maxY * zoom;
    if (top > config.framePadding) {
      y = config.framePadding - bounds.minY * zoom;
    } else if (bottom < config.viewportHeight - config.framePadding) {
      y = config.viewportHeight - config.framePadding - bounds.maxY * zoom;
    }
  }

  return { x, y, zoom };
}
