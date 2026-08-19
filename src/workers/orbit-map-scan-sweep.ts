import type { Graphics } from "@/lib/pixi-imports";

import { getOrbitMapAnimationProgress } from "./orbit-map-animation";
import type { OrbitMapGraphBounds } from "./orbit-map-camera";

const SWEEP_DURATION_MS = 2600;
const SWEEP_TRAIL_RAD = 0.7;
const SWEEP_MAX_GLINTS = 400;

export type OrbitMapSweepNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
  radius: number;
};

export interface OrbitMapScanSweepDeps {
  getNodeById: () => Map<string, OrbitMapSweepNode>;
  getNodeData: () => OrbitMapSweepNode[];
  getGraphBounds: () => OrbitMapGraphBounds | null;
  getMeteorLanding: (nodeId: string) => { x: number; y: number } | null;
  onStart: () => void;
}

export function createOrbitMapScanSweep(deps: OrbitMapScanSweepDeps) {
  let activeSweep: {
    startTime: number;
    duration: number;
    maxRadius: number;
    glints: Array<{ id: string; angle: number; x: number; y: number }>;
  } | null = null;

  function resolveGlintPosition(nodeId: string, datum: OrbitMapSweepNode) {
    return deps.getMeteorLanding(nodeId) ?? { x: datum.x, y: datum.y };
  }

  function start(nodeIds?: string[] | null) {
    const nodeData = deps.getNodeData();
    if (nodeData.length === 0) return;

    const bounds = deps.getGraphBounds();
    const maxRadius = bounds
      ? Math.max(
          Math.abs(bounds.minX),
          Math.abs(bounds.maxX),
          Math.abs(bounds.minY),
          Math.abs(bounds.maxY)
        ) + 60
      : 1400;

    const glints: Array<{ id: string; angle: number; x: number; y: number }> = [];
    const nodeById = deps.getNodeById();
    const source = nodeIds
      ? nodeIds.map((id) => nodeById.get(id)).filter(Boolean)
      : nodeData.filter((datum) => datum.kind === "bookmark");

    for (const datum of source) {
      if (glints.length >= SWEEP_MAX_GLINTS) break;
      if (!datum) continue;
      const { x, y } = resolveGlintPosition(datum.id, datum);
      const angle =
        (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      glints.push({ id: datum.id, angle, x, y });
    }

    activeSweep = {
      startTime: Date.now(),
      duration: SWEEP_DURATION_MS,
      maxRadius,
      glints,
    };
    deps.onStart();
  }

  function render(
    graphics: Graphics,
    accent: number,
    mixColors: (a: number, b: number, t: number) => number
  ) {
    if (!activeSweep) return;

    const progress = getOrbitMapAnimationProgress(activeSweep);
    if (progress >= 1) {
      activeSweep = null;
      return;
    }

    const sweepAngle = progress * Math.PI * 2 - Math.PI / 2;
    const { maxRadius } = activeSweep;
    const beamColor = mixColors(accent, 0xffffff, 0.3);

    for (let band = 0; band < 3; band += 1) {
      const span = SWEEP_TRAIL_RAD * (1 - band * 0.3);
      graphics.moveTo(0, 0);
      graphics.arc(0, 0, maxRadius, sweepAngle - span, sweepAngle);
      graphics.lineTo(0, 0);
      graphics.fill({ color: beamColor, alpha: 0.022 });
    }
    graphics.moveTo(0, 0);
    graphics.lineTo(
      Math.cos(sweepAngle) * maxRadius,
      Math.sin(sweepAngle) * maxRadius
    );
    graphics.stroke({ width: 1.5, color: beamColor, alpha: 0.4 });

    const swept = progress * Math.PI * 2;
    const nodeById = deps.getNodeById();
    for (const glint of activeSweep.glints) {
      const offset = glint.angle - swept;
      if (offset > 0 || offset < -SWEEP_TRAIL_RAD) continue;
      const strength = 1 + offset / SWEEP_TRAIL_RAD;
      const datum = nodeById.get(glint.id);
      if (!datum) continue;
      graphics.circle(glint.x, glint.y, datum.radius + 2.5);
      graphics.fill({ color: beamColor, alpha: 0.55 * strength });
    }
  }

  return {
    isActive: () => activeSweep !== null,
    start,
    render,
    reset: () => {
      activeSweep = null;
    },
  };
}
