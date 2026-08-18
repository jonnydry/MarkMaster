import type { Container, Sprite, Texture } from "@/lib/pixi-imports";
import { Sprite as PixiSprite } from "@/lib/pixi-imports";

import { hashOrbitMapStringToSeed } from "./orbit-map-scene";
import type { OrbitMapOrbitGeometry } from "./orbit-map-cluster-layout";

/** Tangential speed of ring bookmarks (px/s). */
const ORBIT_RING_LINEAR_SPEED = 2.2;
/** Loose-belt angular velocity: one revolution ≈ 8 minutes. */
const ORBIT_BELT_OMEGA = (Math.PI * 2) / 480;
const BELT_WOBBLE_AMPLITUDE = 2.5;
const BELT_WOBBLE_SPEED = 0.35;
export const LIVING_REFRESH_MS = 2000;
const CORONA_SPIN = 0.06;
const CORONA_BREATH_PERIOD_MS = 3700;

export type OrbitMapLivingNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
  radius: number;
};

interface OrbitMotionState {
  cx: number;
  cy: number;
  r: number;
  theta0: number;
  omega: number;
  belt: boolean;
  wobblePhase: number;
}

export interface OrbitMapLivingRuntimeDeps {
  getNodeById: () => Map<string, OrbitMapLivingNode>;
  getNodeData: () => OrbitMapLivingNode[];
  getDraggingNodeId: () => string | null;
  getAnimatedNodeIds: () => Set<string> | null;
  getGlowContainer: () => Container | null;
  getGlowTexture: () => Texture | null;
  getAdditiveBlendMode: () => "add" | "normal";
  hasApp: () => boolean;
}

export function createOrbitMapLivingRuntime(deps: OrbitMapLivingRuntimeDeps) {
  const orbitStates = new Map<string, OrbitMotionState>();
  let orbitEpoch = 0;
  let enabled = false;
  let pageVisible = true;
  let lastStyleRefreshAt = 0;
  let coronaFlares: Array<{ sprite: Sprite; spin: number; baseAlpha: number }> =
    [];

  function isActive() {
    return enabled && pageVisible && deps.getNodeData().length > 0 && deps.hasApp();
  }

  function clearSunCorona() {
    for (const flare of coronaFlares) {
      flare.sprite.parent?.removeChild(flare.sprite);
    }
    coronaFlares = [];
  }

  function discardCoronaSprites() {
    coronaFlares = [];
  }

  function buildSunCorona() {
    discardCoronaSprites();
    const glowTexture = deps.getGlowTexture();
    const glowContainer = deps.getGlowContainer();
    if (!enabled || !glowTexture || !glowContainer) return;
    const coreDatum = deps.getNodeData().find((datum) => datum.kind === "core");
    if (!coreDatum) return;

    const blendMode = deps.getAdditiveBlendMode();
    const configs = [
      { width: 9, height: 4, tint: 0xfacc15, alpha: 0.3, spin: CORONA_SPIN },
      {
        width: 6.5,
        height: 3,
        tint: 0xf97316,
        alpha: 0.24,
        spin: -CORONA_SPIN * 0.7,
      },
    ];
    for (const config of configs) {
      const sprite = new PixiSprite(glowTexture);
      sprite.anchor.set(0.5);
      sprite.tint = config.tint;
      sprite.blendMode = blendMode;
      sprite.alpha = config.alpha;
      sprite.width = coreDatum.radius * config.width;
      sprite.height = coreDatum.radius * config.height;
      sprite.position.set(coreDatum.x, coreDatum.y);
      glowContainer.addChild(sprite);
      coronaFlares.push({ sprite, spin: config.spin, baseAlpha: config.alpha });
    }
  }

  function animateCorona(now: number) {
    if (coronaFlares.length === 0) return;
    const t = (now - orbitEpoch) / 1000;
    const breath = Math.sin(
      ((now % CORONA_BREATH_PERIOD_MS) / CORONA_BREATH_PERIOD_MS) * Math.PI * 2
    );
    for (let i = 0; i < coronaFlares.length; i += 1) {
      const flare = coronaFlares[i];
      flare.sprite.rotation = flare.spin * t;
      flare.sprite.alpha =
        flare.baseAlpha * (1 + 0.12 * (i === 0 ? breath : -breath));
    }
  }

  function setFlareBlendMode(blendMode: "add" | "normal") {
    for (const flare of coronaFlares) flare.sprite.blendMode = blendMode;
  }

  function buildOrbitStates(orbits: Map<string, OrbitMapOrbitGeometry>) {
    orbitStates.clear();
    orbitEpoch = Date.now();
    for (const [nodeId, orbit] of orbits) {
      const direction = orbit.anchorId
        ? hashOrbitMapStringToSeed(orbit.anchorId) % 2 === 0
          ? 1
          : -1
        : 1;
      const belt = orbit.ringIndex < 0;
      const omega = belt
        ? ORBIT_BELT_OMEGA
        : (ORBIT_RING_LINEAR_SPEED / Math.max(20, orbit.radius)) * direction;
      orbitStates.set(nodeId, {
        cx: orbit.centerX,
        cy: orbit.centerY,
        r: orbit.radius,
        theta0: orbit.theta,
        omega,
        belt,
        wobblePhase: belt
          ? (hashOrbitMapStringToSeed(nodeId) % 6283) / 1000
          : 0,
      });
    }
  }

  function advanceOrbits(now: number) {
    if (!isActive() || orbitStates.size === 0) return;
    const t = (now - orbitEpoch) / 1000;
    const draggingId = deps.getDraggingNodeId();
    const animatedIds = deps.getAnimatedNodeIds();
    const nodeById = deps.getNodeById();

    for (const [nodeId, orbit] of orbitStates) {
      if (nodeId === draggingId || animatedIds?.has(nodeId)) continue;
      const datum = nodeById.get(nodeId);
      if (!datum) continue;
      const angle = orbit.theta0 + orbit.omega * t;
      const radius = orbit.belt
        ? orbit.r +
          BELT_WOBBLE_AMPLITUDE *
            Math.sin(t * BELT_WOBBLE_SPEED + orbit.wobblePhase)
        : orbit.r;
      datum.x = orbit.cx + Math.cos(angle) * radius;
      datum.y = orbit.cy + Math.sin(angle) * radius;
    }
  }

  function rebaseOrbitTheta(nodeId: string) {
    const orbit = orbitStates.get(nodeId);
    const datum = deps.getNodeById().get(nodeId);
    if (!orbit || !datum) return;
    orbit.theta0 =
      Math.atan2(datum.y - orbit.cy, datum.x - orbit.cx) -
      orbit.omega * ((Date.now() - orbitEpoch) / 1000);
  }

  function shouldRefreshStyles(now: number) {
    if (now - lastStyleRefreshAt < LIVING_REFRESH_MS) return false;
    lastStyleRefreshAt = now;
    return true;
  }

  function reset() {
    discardCoronaSprites();
    orbitStates.clear();
    orbitEpoch = 0;
    enabled = false;
    pageVisible = true;
    lastStyleRefreshAt = 0;
  }

  return {
    isActive,
    isEnabled: () => enabled,
    setEnabled: (next: boolean) => {
      enabled = next;
    },
    isPageVisible: () => pageVisible,
    setPageVisible: (next: boolean) => {
      pageVisible = next;
    },
    hasOrbit: (nodeId: string) => orbitStates.has(nodeId),
    orbitingIds: () => orbitStates.keys(),
    buildOrbitStates,
    advanceOrbits,
    rebaseOrbitTheta,
    releaseOrbit: (nodeId: string) => {
      orbitStates.delete(nodeId);
    },
    buildSunCorona,
    clearSunCorona,
    discardCoronaSprites,
    animateCorona,
    setFlareBlendMode,
    shouldRefreshStyles,
    reset,
  };
}
