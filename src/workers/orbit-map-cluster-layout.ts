/**
 * Deterministic two-phase cluster layout for the Orbit map.
 *
 * Phase 1 — anchor constellation: a short, synchronous d3-force run over only
 * core + tag/collection hubs, with links weighted by bookmark co-occurrence,
 * collision radii sized to each hub's full orbit cluster. Frozen afterwards.
 *
 * Phase 2 — analytic bookmark placement (no per-bookmark forces):
 * - single-anchor bookmarks sit on concentric rings around their hub
 * - multi-anchor bookmarks sit at the weighted centroid of their hubs
 *   (hash jitter + a few collision-relax passes)
 * - loose bookmarks form a sparse sunflower band outside the constellation
 *
 * Everything is a pure function of the graph payload, so the layout is stable
 * across reloads and cheap to recompute — no persistence required.
 */

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { OrbitGraphEdge, OrbitGraphNode } from "@/types";

export interface OrbitMapLayoutNodeInput {
  id: string;
  kind: OrbitGraphNode["kind"];
  radius: number;
  /**
   * Recency signal for bookmarks. Recent members fill a cluster's inner
   * shells first, so orbital distance reads as age — like tree rings.
   */
  recent?: boolean;
}

export interface OrbitMapCluster {
  anchorId: string;
  x: number;
  y: number;
  /** World radius enclosing the anchor's orbit rings. */
  radius: number;
  /** Bookmarks (and overflow markers) placed on this anchor's rings. */
  memberCount: number;
}

/**
 * Circular-orbit geometry for one node, in world space. The node's layout
 * position is exactly `center + radius × (cos θ, sin θ)`, so a renderer can
 * animate `θ(t) = theta + ω·t` and the motion passes through the static
 * layout at t = 0. Nodes on the same ring (or in the belt) rotate rigidly
 * when they share an angular velocity, preserving the layout's spacing.
 */
export interface OrbitMapOrbitGeometry {
  centerX: number;
  centerY: number;
  radius: number;
  /** Angle (radians) of the node's layout position. */
  theta: number;
  /** Ring index within its cluster, or -1 for the loose belt. */
  ringIndex: number;
  /** Cluster anchor id for ring orbits; null for the loose belt. */
  anchorId: string | null;
}

export interface OrbitMapClusterLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  clusters: Map<string, OrbitMapCluster>;
  /**
   * Orbit geometry for every node that revolves around something: cluster
   * ring members (single-anchor bookmarks + overflow) and loose-belt
   * bookmarks. Multi-anchor bookmarks are tethered between hubs and have no
   * orbit.
   */
  orbits: Map<string, OrbitMapOrbitGeometry>;
  /** Radius of the anchor constellation; the loose band starts outside it. */
  constellationRadius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** First orbit ring distance from the hub's edge. */
const RING_START_GAP = 22;
/** Distance between consecutive orbit rings. */
const RING_GAP = 17;
/** Approximate arc length reserved per bookmark on a ring. */
const RING_SLOT_SPACING = 15;
/** Minimum clearance kept between neighboring clusters by the collide force. */
export const ORBIT_MAP_CLUSTER_PADDING = 30;
/** Gap between the constellation edge and the loose bookmark band. */
export const ORBIT_MAP_LOOSE_BAND_GAP = 110;

const ANCHOR_SIM_TICKS = 300;
const MULTI_JITTER_MIN = 14;
const MULTI_JITTER_RANGE = 26;
const MULTI_MIN_SEPARATION = 13;
const MULTI_RELAX_ITERATIONS = 3;
const LOOSE_MIN_SEPARATION = 11;
const LOOSE_RELAX_ITERATIONS = 4;

function hashId(id: string, salt = 0): number {
  let hash = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic [0, 1) value derived from a node id. */
function hash01(id: string, salt = 0): number {
  return hashId(id, salt) / 4294967296;
}

interface RingPlan {
  radius: number;
  capacity: number;
}

/** Concentric rings sized so `memberCount` bookmarks fit around the hub. */
function planRings(hubRadius: number, memberCount: number): RingPlan[] {
  const rings: RingPlan[] = [];
  let remaining = memberCount;
  let radius = hubRadius + RING_START_GAP;
  while (remaining > 0) {
    const capacity = Math.max(
      6,
      Math.floor((2 * Math.PI * radius) / RING_SLOT_SPACING)
    );
    rings.push({ radius, capacity });
    remaining -= capacity;
    radius += RING_GAP;
  }
  return rings;
}

function clusterRadiusFromRings(hubRadius: number, rings: RingPlan[]): number {
  if (rings.length === 0) return hubRadius + 14;
  return rings[rings.length - 1].radius + RING_GAP * 0.5;
}

/**
 * Radii of a cluster's orbit shells, matching the planRings geometry — used
 * to draw ring guides that pass through the actual bookmark positions.
 * Capped so a degenerate radius can't produce an unbounded list.
 */
export function getOrbitMapClusterRingRadii(
  hubRadius: number,
  clusterRadius: number
): number[] {
  const radii: number[] = [];
  let radius = hubRadius + RING_START_GAP;
  while (radius <= clusterRadius - RING_GAP * 0.5 + 0.01 && radii.length < 12) {
    radii.push(radius);
    radius += RING_GAP;
  }
  return radii;
}

interface AnchorSimNode extends SimulationNodeDatum {
  id: string;
  clusterRadius: number;
}

interface AnchorSimLink extends SimulationLinkDatum<AnchorSimNode> {
  distance: number;
  strength: number;
}

/** Pairwise key independent of order. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface RelaxPoint {
  x: number;
  y: number;
  /** Index into the movable array, or -1 for a static obstacle. */
  movableIndex: number;
}

/**
 * A few grid-based separation passes pushing movable points apart from each
 * other and away from static obstacles. Mutates `movable` in place.
 */
function relaxOverlaps(
  movable: Array<{ x: number; y: number }>,
  statics: Array<{ x: number; y: number }>,
  minSeparation: number,
  iterations: number
) {
  if (movable.length === 0) return;
  const cellSize = minSeparation * 2;
  const key = (x: number, y: number) =>
    `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;

  for (let iter = 0; iter < iterations; iter++) {
    const grid = new Map<string, RelaxPoint[]>();
    const insert = (point: RelaxPoint) => {
      const k = key(point.x, point.y);
      const bucket = grid.get(k);
      if (bucket) bucket.push(point);
      else grid.set(k, [point]);
    };
    statics.forEach((p) => insert({ x: p.x, y: p.y, movableIndex: -1 }));
    movable.forEach((p, index) =>
      insert({ x: p.x, y: p.y, movableIndex: index })
    );

    for (let i = 0; i < movable.length; i++) {
      const point = movable[i];
      const cx = Math.floor(point.x / cellSize);
      const cy = Math.floor(point.y / cellSize);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const bucket = grid.get(`${gx}:${gy}`);
          if (!bucket) continue;
          for (const other of bucket) {
            if (other.movableIndex === i) continue;
            const dx = point.x - other.x;
            const dy = point.y - other.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= minSeparation) continue;
            // Coincident points get a deterministic nudge direction.
            const angle =
              dist < 0.01 ? hash01(`${i}`, iter) * Math.PI * 2 : Math.atan2(dy, dx);
            const push = (minSeparation - dist) *
              (other.movableIndex === -1 ? 1 : 0.5);
            point.x += Math.cos(angle) * push;
            point.y += Math.sin(angle) * push;
          }
        }
      }
    }
  }
}

export function computeOrbitMapClusterLayout(
  nodes: OrbitMapLayoutNodeInput[],
  edges: OrbitGraphEdge[]
): OrbitMapClusterLayoutResult {
  const positions = new Map<string, { x: number; y: number }>();
  const clusters = new Map<string, OrbitMapCluster>();
  const orbits = new Map<string, OrbitMapOrbitGeometry>();

  const anchors = nodes.filter(
    (node) => node.kind === "tag" || node.kind === "collection"
  );
  const bookmarks = nodes.filter((node) => node.kind === "bookmark");
  const overflows = nodes.filter((node) => node.kind === "overflow");
  const core = nodes.find((node) => node.kind === "core");
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));

  // --- Membership indexes -------------------------------------------------
  const bookmarkAnchors = new Map<string, string[]>();
  const overflowAnchor = new Map<string, string>();
  const anchorOverflow = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind === "bookmark-tag" || edge.kind === "bookmark-collection") {
      const anchorId =
        edge.kind === "bookmark-tag" ? edge.tagId : edge.collectionId;
      if (!anchorIds.has(anchorId)) continue;
      const list = bookmarkAnchors.get(edge.bookmarkId);
      if (list) list.push(anchorId);
      else bookmarkAnchors.set(edge.bookmarkId, [anchorId]);
    } else if (edge.kind === "overflow") {
      overflowAnchor.set(edge.overflowId, edge.anchorId);
      anchorOverflow.set(edge.anchorId, edge.overflowId);
    }
  }

  const singleMembers = new Map<string, string[]>();
  const multiBookmarks: Array<{ id: string; anchorIds: string[] }> = [];
  const looseIds: string[] = [];
  for (const bookmark of bookmarks) {
    const connected = bookmarkAnchors.get(bookmark.id) ?? [];
    if (connected.length === 0) {
      looseIds.push(bookmark.id);
    } else if (connected.length === 1) {
      const list = singleMembers.get(connected[0]);
      if (list) list.push(bookmark.id);
      else singleMembers.set(connected[0], [bookmark.id]);
    } else {
      multiBookmarks.push({ id: bookmark.id, anchorIds: connected });
    }
  }
  // Overflow markers without a placeable anchor fall into the loose band.
  for (const overflow of overflows) {
    const anchorId = overflowAnchor.get(overflow.id);
    if (!anchorId || !anchorIds.has(anchorId)) looseIds.push(overflow.id);
  }

  // --- Cluster sizing -----------------------------------------------------
  const recentById = new Map<string, boolean>();
  for (const node of nodes) {
    if (node.recent) recentById.set(node.id, true);
  }

  const ringPlans = new Map<string, RingPlan[]>();
  const clusterRadii = new Map<string, number>();
  const ringMembers = new Map<string, string[]>();
  for (const anchor of anchors) {
    // Recent bookmarks first, so they fill the inner shells and orbital
    // distance reads as age (stable sort keeps the rest deterministic).
    // The overflow marker always goes last — the outermost slot.
    const members = [...(singleMembers.get(anchor.id) ?? [])].sort(
      (a, b) => (recentById.has(b) ? 1 : 0) - (recentById.has(a) ? 1 : 0)
    );
    const overflowId = anchorOverflow.get(anchor.id);
    if (overflowId && overflows.some((o) => o.id === overflowId)) {
      members.push(overflowId);
    }
    ringMembers.set(anchor.id, members);
    const rings = planRings(anchor.radius, members.length);
    ringPlans.set(anchor.id, rings);
    clusterRadii.set(anchor.id, clusterRadiusFromRings(anchor.radius, rings));
  }

  // --- Phase 1: anchor constellation --------------------------------------
  // Seed on a golden-angle spiral, biggest clusters near the center, then let
  // co-occurrence links pull related topics together while collision keeps
  // whole clusters from overlapping.
  const orderedAnchors = [...anchors].sort((a, b) => {
    const sizeA = ringMembers.get(a.id)?.length ?? 0;
    const sizeB = ringMembers.get(b.id)?.length ?? 0;
    if (sizeA !== sizeB) return sizeB - sizeA;
    return a.id < b.id ? -1 : 1;
  });

  const simNodes: AnchorSimNode[] = orderedAnchors.map((anchor, index) => {
    const angle = index * GOLDEN_ANGLE;
    const distance = 180 + 130 * Math.sqrt(index);
    return {
      id: anchor.id,
      clusterRadius: clusterRadii.get(anchor.id) ?? anchor.radius + 14,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  });

  if (core) {
    simNodes.push({
      id: core.id,
      clusterRadius: core.radius + 40,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
    });
  }

  if (orderedAnchors.length > 0) {
    const cooccurrence = new Map<string, number>();
    for (const { anchorIds: list } of multiBookmarks) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const key = pairKey(list[i], list[j]);
          cooccurrence.set(key, (cooccurrence.get(key) ?? 0) + 1);
        }
      }
    }

    const links: AnchorSimLink[] = [];
    if (core) {
      for (const anchor of orderedAnchors) {
        links.push({
          source: core.id,
          target: anchor.id,
          distance:
            200 + (clusterRadii.get(anchor.id) ?? 20) + ORBIT_MAP_CLUSTER_PADDING,
          strength: 0.04,
        });
      }
    }
    for (const [key, count] of cooccurrence) {
      const [a, b] = key.split("|");
      links.push({
        source: a,
        target: b,
        distance:
          (clusterRadii.get(a) ?? 20) +
          (clusterRadii.get(b) ?? 20) +
          ORBIT_MAP_CLUSTER_PADDING +
          36,
        strength: Math.min(0.5, 0.12 + count * 0.04),
      });
    }

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<AnchorSimNode, AnchorSimLink>(links)
          .id((node) => node.id)
          .distance((link) => link.distance)
          .strength((link) => link.strength)
      )
      .force("charge", forceManyBody().strength(-420))
      .force(
        "collide",
        forceCollide<AnchorSimNode>()
          .radius((node) => node.clusterRadius + ORBIT_MAP_CLUSTER_PADDING)
          .strength(0.95)
          .iterations(2)
      )
      .force("x", forceX(0).strength(0.05))
      .force("y", forceY(0).strength(0.05));

    // Drive the simulation synchronously and freeze the result. d3-force v3
    // uses a deterministic random source, so this is stable across runs.
    simulation.stop();
    for (let tick = 0; tick < ANCHOR_SIM_TICKS; tick++) {
      simulation.tick();
    }
  }

  for (const simNode of simNodes) {
    positions.set(simNode.id, { x: simNode.x ?? 0, y: simNode.y ?? 0 });
  }
  if (core) positions.set(core.id, { x: 0, y: 0 });

  // --- Phase 2a: orbit ring placement -------------------------------------
  for (const anchor of anchors) {
    const center = positions.get(anchor.id) ?? { x: 0, y: 0 };
    const rings = ringPlans.get(anchor.id) ?? [];
    const members = ringMembers.get(anchor.id) ?? [];
    clusters.set(anchor.id, {
      anchorId: anchor.id,
      x: center.x,
      y: center.y,
      radius: clusterRadii.get(anchor.id) ?? anchor.radius + 14,
      memberCount: members.length,
    });

    const angleOffset = hash01(anchor.id) * Math.PI * 2;
    let memberIndex = 0;
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      const ring = rings[ringIndex];
      const inRing = Math.min(ring.capacity, members.length - memberIndex);
      for (let slot = 0; slot < inRing; slot++) {
        const angle =
          angleOffset +
          ringIndex * 0.35 +
          (slot / Math.max(inRing, 1)) * Math.PI * 2;
        positions.set(members[memberIndex], {
          x: center.x + Math.cos(angle) * ring.radius,
          y: center.y + Math.sin(angle) * ring.radius,
        });
        orbits.set(members[memberIndex], {
          centerX: center.x,
          centerY: center.y,
          radius: ring.radius,
          theta: angle,
          ringIndex,
          anchorId: anchor.id,
        });
        memberIndex++;
      }
    }
  }

  // --- Phase 2b: multi-anchor centroids + collision relax ------------------
  const multiPositions: Array<{ x: number; y: number }> = multiBookmarks.map(
    ({ id, anchorIds: list }) => {
      let cx = 0;
      let cy = 0;
      for (const anchorId of list) {
        const p = positions.get(anchorId) ?? { x: 0, y: 0 };
        cx += p.x;
        cy += p.y;
      }
      cx /= list.length;
      cy /= list.length;
      const jitterRadius = MULTI_JITTER_MIN + hash01(id, 7) * MULTI_JITTER_RANGE;
      const jitterAngle = hash01(id, 13) * Math.PI * 2;
      return {
        x: cx + Math.cos(jitterAngle) * jitterRadius,
        y: cy + Math.sin(jitterAngle) * jitterRadius,
      };
    }
  );

  const staticObstacles: Array<{ x: number; y: number }> = [];
  for (const members of ringMembers.values()) {
    for (const id of members) {
      const p = positions.get(id);
      if (p) staticObstacles.push(p);
    }
  }
  relaxOverlaps(
    multiPositions,
    staticObstacles,
    MULTI_MIN_SEPARATION,
    MULTI_RELAX_ITERATIONS
  );
  multiBookmarks.forEach(({ id }, index) => {
    positions.set(id, multiPositions[index]);
  });

  // --- Constellation radius -----------------------------------------------
  let constellationRadius = 260;
  for (const cluster of clusters.values()) {
    constellationRadius = Math.max(
      constellationRadius,
      Math.hypot(cluster.x, cluster.y) + cluster.radius
    );
  }
  for (const point of multiPositions) {
    constellationRadius = Math.max(
      constellationRadius,
      Math.hypot(point.x, point.y) + 20
    );
  }

  // --- Phase 2c: loose sunflower band --------------------------------------
  if (looseIds.length > 0) {
    const bandInner = constellationRadius + ORBIT_MAP_LOOSE_BAND_GAP;
    const bandWidth = Math.min(420, Math.max(120, looseIds.length * 1.4));
    const loosePositions = looseIds.map((id, index) => {
      const t = (index + 0.5) / looseIds.length;
      const radius = bandInner + bandWidth * Math.sqrt(t);
      // Keep the low-discrepancy sunflower ordering, but add tiny deterministic
      // per-node angle noise so Fibonacci-neighbor streaks don't line up exactly
      // in very large loose bands.
      const angle =
        index * GOLDEN_ANGLE +
        hash01(id, 3) * 0.06 +
        (hash01(id, 29) - 0.5) * 0.018;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
    relaxOverlaps(
      loosePositions,
      [],
      LOOSE_MIN_SEPARATION,
      LOOSE_RELAX_ITERATIONS
    );
    looseIds.forEach((id, index) => {
      const position = loosePositions[index];
      positions.set(id, position);
      // Belt orbit derived from the relaxed position so the circle passes
      // exactly through it; the whole belt shares one ω, so it rotates
      // rigidly and the relaxed spacing is preserved.
      const radius = Math.hypot(position.x, position.y);
      if (radius > 1) {
        orbits.set(id, {
          centerX: 0,
          centerY: 0,
          radius,
          theta: Math.atan2(position.y, position.x),
          ringIndex: -1,
          anchorId: null,
        });
      }
    });
  }

  // --- Safety net: every node gets a finite position -----------------------
  for (const node of nodes) {
    const position = positions.get(node.id);
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      const angle = hash01(node.id) * Math.PI * 2;
      const radius = 80 + hash01(node.id, 5) * 520;
      positions.set(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }

  return { positions, clusters, orbits, constellationRadius };
}
