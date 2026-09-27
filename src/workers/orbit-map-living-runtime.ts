/**
 * Living motion — the orrery. Each disc's rings turn around its hub:
 * - inner rings (the newest saves) turn faster than outer ones, Kepler-style
 * - a disc turns faster the more you've saved to it in the last 30 days
 * - discs with no recent saves stand still
 * Hubs never move, so the layout people have learned stays where it is.
 *
 * Positions are pure functions of wall-clock time — θ(t) = θ₀ + ω·t — so a
 * frame costs one cos/sin per moving dot and still discs cost nothing.
 */

import type { OrbitMapOrbitGeometry } from "./orbit-map-cluster-layout";

/** FNV-1a; kept local so this module stays free of Pixi imports. */
function hashId(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Seconds per turn for the innermost ring of a fully active disc. */
export const ORBIT_MAP_INNER_RING_PERIOD_S = 24;
export const LIVING_REFRESH_MS = 2000;

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
  /** Innermost ring radius of this node's disc (Kepler reference). */
  r0: number;
  theta0: number;
  omega: number;
  anchorId: string | null;
}

export interface OrbitMapLivingRuntimeDeps {
  getNodeById: () => Map<string, OrbitMapLivingNode>;
  getNodeData: () => OrbitMapLivingNode[];
  getDraggingNodeId: () => string | null;
  getAnimatedNodeIds: () => Set<string> | null;
  hasApp: () => boolean;
}

/**
 * Angular velocity (rad/s) for a dot on ring radius `r` of a disc whose
 * innermost ring is `r0`. Zero for quiet discs; direction alternates by disc
 * so neighbours counter-rotate like gears.
 */
export function getOrbitMapRingOmega(
  anchorId: string | null,
  r: number,
  r0: number,
  activity: number
): number {
  if (!anchorId || activity <= 0) return 0;
  const direction = hashId(anchorId) % 2 === 0 ? 1 : -1;
  const kepler = Math.pow(r0 / Math.max(r, r0, 1), 1.5);
  return direction * activity * ((Math.PI * 2) / ORBIT_MAP_INNER_RING_PERIOD_S) * kepler;
}

export function createOrbitMapLivingRuntime(deps: OrbitMapLivingRuntimeDeps) {
  const orbitStates = new Map<string, OrbitMotionState>();
  let orbitEpoch = 0;
  let enabled = false;
  let pageVisible = true;
  let anyMoving = false;
  let lastStyleRefreshAt = 0;

  function isActive() {
    return (
      enabled && pageVisible && anyMoving && deps.getNodeData().length > 0 && deps.hasApp()
    );
  }

  function elapsedSeconds(now = Date.now()) {
    return (now - orbitEpoch) / 1000;
  }

  function buildOrbitStates(
    orbits: Map<string, OrbitMapOrbitGeometry>,
    activityOf: (anchorId: string) => number
  ) {
    orbitStates.clear();
    orbitEpoch = Date.now();
    anyMoving = false;

    const innermost = new Map<string, number>();
    for (const orbit of orbits.values()) {
      const key = orbit.anchorId ?? "";
      innermost.set(key, Math.min(innermost.get(key) ?? Infinity, orbit.radius));
    }

    for (const [nodeId, orbit] of orbits) {
      const r0 = innermost.get(orbit.anchorId ?? "") ?? orbit.radius;
      const omega = getOrbitMapRingOmega(
        orbit.anchorId,
        orbit.radius,
        r0,
        orbit.anchorId ? activityOf(orbit.anchorId) : 0
      );
      if (omega !== 0) anyMoving = true;
      orbitStates.set(nodeId, {
        cx: orbit.centerX,
        cy: orbit.centerY,
        r: orbit.radius,
        r0,
        theta0: orbit.theta,
        omega,
        anchorId: orbit.anchorId,
      });
    }
  }

  /** Re-derives speeds after activity changes, keeping every dot in place. */
  function retune(activityOf: (anchorId: string) => number) {
    const t = elapsedSeconds();
    anyMoving = false;
    for (const state of orbitStates.values()) {
      const angle = state.theta0 + state.omega * t;
      state.omega = getOrbitMapRingOmega(
        state.anchorId,
        state.r,
        state.r0,
        state.anchorId ? activityOf(state.anchorId) : 0
      );
      state.theta0 = angle - state.omega * t;
      if (state.omega !== 0) anyMoving = true;
    }
  }

  /** Re-phases every orbit so motion resumes from where the dots are now. */
  function rebaseAll() {
    const nodeById = deps.getNodeById();
    const t = elapsedSeconds();
    for (const [nodeId, state] of orbitStates) {
      const datum = nodeById.get(nodeId);
      if (!datum) continue;
      state.theta0 = Math.atan2(datum.y - state.cy, datum.x - state.cx) - state.omega * t;
    }
  }

  function advanceOrbits(now: number) {
    if (!isActive() || orbitStates.size === 0) return;
    const t = elapsedSeconds(now);
    const draggingId = deps.getDraggingNodeId();
    const animatedIds = deps.getAnimatedNodeIds();
    const nodeById = deps.getNodeById();

    for (const [nodeId, state] of orbitStates) {
      if (state.omega === 0) continue;
      if (nodeId === draggingId || animatedIds?.has(nodeId)) continue;
      const datum = nodeById.get(nodeId);
      if (!datum) continue;
      const angle = state.theta0 + state.omega * t;
      datum.x = state.cx + Math.cos(angle) * state.r;
      datum.y = state.cy + Math.sin(angle) * state.r;
    }
  }

  function rebaseOrbitTheta(nodeId: string) {
    const state = orbitStates.get(nodeId);
    const datum = deps.getNodeById().get(nodeId);
    if (!state || !datum) return;
    state.theta0 =
      Math.atan2(datum.y - state.cy, datum.x - state.cx) - state.omega * elapsedSeconds();
  }

  function shouldRefreshStyles(now: number) {
    if (now - lastStyleRefreshAt < LIVING_REFRESH_MS) return false;
    lastStyleRefreshAt = now;
    return true;
  }

  function reset() {
    orbitStates.clear();
    orbitEpoch = 0;
    enabled = false;
    pageVisible = true;
    anyMoving = false;
    lastStyleRefreshAt = 0;
  }

  return {
    isActive,
    isEnabled: () => enabled,
    setEnabled: (next: boolean) => {
      // Resume from the current configuration instead of jumping ahead by
      // however long motion was off.
      if (next && !enabled) rebaseAll();
      enabled = next;
    },
    isPageVisible: () => pageVisible,
    setPageVisible: (next: boolean) => {
      pageVisible = next;
    },
    hasOrbit: (nodeId: string) => orbitStates.has(nodeId),
    orbitingIds: () => orbitStates.keys(),
    buildOrbitStates,
    retune,
    advanceOrbits,
    rebaseOrbitTheta,
    releaseOrbit: (nodeId: string) => {
      orbitStates.delete(nodeId);
    },
    shouldRefreshStyles,
    reset,
  };
}
