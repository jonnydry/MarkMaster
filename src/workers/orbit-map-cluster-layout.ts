/**
 * Deterministic two-phase cluster layout for the Orbit map.
 *
 * Phase 1 — anchor constellation: a short, synchronous d3-force run over only
 * core + tag/collection hubs, with links weighted by bookmark co-occurrence,
 * collision radii sized to each hub's full disc. Frozen afterwards.
 *
 * Phase 2 — analytic bookmark placement (no per-bookmark forces). Every
 * bookmark sits on a concentric ring around exactly one home, newest nearest
 * the hub:
 * - filed bookmarks orbit their first tag (else their first collection);
 *   their other homes are linked on selection, not by position
 * - loose bookmarks orbit the core (the Orbit queue)
 * - "+N" overflow markers sit on their disc's rim
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
   * Used only when `age` is missing.
   */
  recent?: boolean;
  /** Days since the bookmark was saved; orders rings newest-first. */
  age?: number;
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
  /** Ring index within its cluster (0 = innermost, newest). */
  ringIndex: number;
  /** Home the node orbits (a hub or the core); null only without a core. */
  anchorId: string | null;
}

export interface OrbitMapClusterLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  clusters: Map<string, OrbitMapCluster>;
  /**
   * Orbit geometry for every bookmark: each sits on a ring around its home
   * (a hub, or the core for loose bookmarks). Overflow markers have none.
   */
  orbits: Map<string, OrbitMapOrbitGeometry>;
  /** Radius enclosing every disc. */
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
/** Gap between a disc's outer ring and its "+N" overflow marker. */
const OVERFLOW_RIM_GAP = 10;

const ANCHOR_SIM_TICKS = 300;

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

/** Newest first; missing ages fall back to the `recent` flag. */
function orderByAge(
  ids: string[],
  ageById: Map<string, number>,
  recentIds: Set<string>
): string[] {
  const key = (id: string) =>
    ageById.get(id) ?? (recentIds.has(id) ? 0 : Number.POSITIVE_INFINITY);
  return [...ids].sort((a, b) => {
    const diff = key(a) - key(b);
    return Number.isNaN(diff) ? 0 : diff;
  });
}

/** Places `members` on `rings` around `center`, recording each orbit. */
function placeOnRings(
  anchorId: string | null,
  center: { x: number; y: number },
  rings: RingPlan[],
  members: string[],
  positions: Map<string, { x: number; y: number }>,
  orbits: Map<string, OrbitMapOrbitGeometry>
) {
  const angleOffset = hash01(anchorId ?? "loose") * Math.PI * 2;
  let memberIndex = 0;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    const inRing = Math.min(ring.capacity, members.length - memberIndex);
    for (let slot = 0; slot < inRing; slot++) {
      const angle =
        angleOffset + ringIndex * 0.35 + (slot / Math.max(inRing, 1)) * Math.PI * 2;
      const id = members[memberIndex];
      positions.set(id, {
        x: center.x + Math.cos(angle) * ring.radius,
        y: center.y + Math.sin(angle) * ring.radius,
      });
      orbits.set(id, {
        centerX: center.x,
        centerY: center.y,
        radius: ring.radius,
        theta: angle,
        ringIndex,
        anchorId,
      });
      memberIndex++;
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
  const anchorKind = new Map(anchors.map((anchor) => [anchor.id, anchor.kind]));
  const bookmarks = nodes.filter((node) => node.kind === "bookmark");
  const overflows = nodes.filter((node) => node.kind === "overflow");
  const core = nodes.find((node) => node.kind === "core");
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));

  // --- Membership indexes -------------------------------------------------
  const bookmarkAnchors = new Map<string, string[]>();
  const overflowAnchor = new Map<string, string>();
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
    }
  }

  // Each bookmark orbits one home: its first tag, else its first collection.
  // Bookmarks with several homes still pull those hubs together (below).
  const homeMembers = new Map<string, string[]>();
  const multiBookmarks: Array<{ id: string; anchorIds: string[] }> = [];
  const looseIds: string[] = [];
  for (const bookmark of bookmarks) {
    const connected = bookmarkAnchors.get(bookmark.id) ?? [];
    if (connected.length === 0) {
      looseIds.push(bookmark.id);
      continue;
    }
    const home =
      connected.find((anchorId) => anchorKind.get(anchorId) === "tag") ??
      connected[0];
    const list = homeMembers.get(home);
    if (list) list.push(bookmark.id);
    else homeMembers.set(home, [bookmark.id]);
    if (connected.length > 1) {
      multiBookmarks.push({ id: bookmark.id, anchorIds: connected });
    }
  }

  // --- Cluster sizing -----------------------------------------------------
  const recentIds = new Set<string>();
  const ageById = new Map<string, number>();
  for (const node of nodes) {
    if (node.recent) recentIds.add(node.id);
    if (typeof node.age === "number" && Number.isFinite(node.age)) {
      ageById.set(node.id, node.age);
    }
  }

  const ringPlans = new Map<string, RingPlan[]>();
  const clusterRadii = new Map<string, number>();
  const ringMembers = new Map<string, string[]>();
  for (const anchor of anchors) {
    // Newest first, so they fill the inner shells and orbital distance
    // reads as age, like tree rings.
    const members = orderByAge(homeMembers.get(anchor.id) ?? [], ageById, recentIds);
    ringMembers.set(anchor.id, members);
    const rings = planRings(anchor.radius, members.length);
    ringPlans.set(anchor.id, rings);
    clusterRadii.set(anchor.id, clusterRadiusFromRings(anchor.radius, rings));
  }

  // Loose bookmarks orbit the core, which becomes the Orbit queue's disc.
  const coreRadius = core?.radius ?? 13;
  const looseMembers = orderByAge(looseIds, ageById, recentIds);
  const coreRings = planRings(coreRadius, looseMembers.length);
  const coreClusterRadius = clusterRadiusFromRings(coreRadius, coreRings);

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
    const distance = coreClusterRadius + 80 + 130 * Math.sqrt(index);
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
      clusterRadius: coreClusterRadius,
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
            coreClusterRadius +
            (clusterRadii.get(anchor.id) ?? 20) +
            ORBIT_MAP_CLUSTER_PADDING +
            60,
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

  // --- Phase 2a: rings around every home ---------------------------------
  for (const anchor of anchors) {
    const center = positions.get(anchor.id) ?? { x: 0, y: 0 };
    const members = ringMembers.get(anchor.id) ?? [];
    clusters.set(anchor.id, {
      anchorId: anchor.id,
      x: center.x,
      y: center.y,
      radius: clusterRadii.get(anchor.id) ?? anchor.radius + 14,
      memberCount: members.length,
    });
    placeOnRings(
      anchor.id,
      center,
      ringPlans.get(anchor.id) ?? [],
      members,
      positions,
      orbits
    );
  }

  // --- Phase 2b: the queue disc around the core ----------------------------
  if (core) {
    clusters.set(core.id, {
      anchorId: core.id,
      x: 0,
      y: 0,
      radius: coreClusterRadius,
      memberCount: looseMembers.length,
    });
  }
  placeOnRings(core?.id ?? null, { x: 0, y: 0 }, coreRings, looseMembers, positions, orbits);

  // --- Phase 2c: "+N" markers on their disc's rim --------------------------
  // Bottom-right of the rim; markers that share a disc fan out along it.
  const rimSlots = new Map<string, number>();
  for (const overflow of overflows) {
    const anchorId = overflowAnchor.get(overflow.id);
    const cluster =
      (anchorId ? clusters.get(anchorId) : undefined) ??
      (core ? clusters.get(core.id) : undefined);
    const center = cluster ?? { x: 0, y: 0, radius: coreClusterRadius };
    const key = cluster?.anchorId ?? "";
    const slot = rimSlots.get(key) ?? 0;
    rimSlots.set(key, slot + 1);
    const angle = Math.PI / 4 + slot * 0.3;
    const radius = center.radius + OVERFLOW_RIM_GAP;
    positions.set(overflow.id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }

  // --- Constellation radius -----------------------------------------------
  let constellationRadius = coreClusterRadius;
  for (const cluster of clusters.values()) {
    constellationRadius = Math.max(
      constellationRadius,
      Math.hypot(cluster.x, cluster.y) + cluster.radius
    );
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
