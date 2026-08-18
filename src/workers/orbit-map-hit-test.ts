export interface OrbitMapHitTestNode {
  id: string;
  x?: number;
  y?: number;
  radius: number;
}

/** Minimum on-screen size of a node's padded hit target, in screen pixels. */
const MIN_HIT_TARGET_SCREEN_PX = 14;
/** Below this count, a linear scan beats grid overhead. */
const SPATIAL_INDEX_MIN_NODES = 48;

/**
 * Hit padding (world units) that guarantees the padded target is at least
 * MIN_HIT_TARGET_SCREEN_PX on screen. Without this, world-space padding
 * shrinks with zoom and hubs become near-impossible to click when zoomed out.
 */
export function getOrbitMapHitPadding(
  zoom: number,
  baseWorldPadding = 10
): number {
  if (zoom <= 0) return baseWorldPadding;
  return Math.max(baseWorldPadding, MIN_HIT_TARGET_SCREEN_PX / zoom);
}

export function findClosestOrbitMapNode<TNode extends OrbitMapHitTestNode>(
  nodes: TNode[],
  point: { x: number; y: number },
  hitPadding: number
): TNode | null {
  let closest: TNode | null = null;
  let minDist = Infinity;

  for (const node of nodes) {
    const dx = (node.x ?? 0) - point.x;
    const dy = (node.y ?? 0) - point.y;
    const dist = Math.hypot(dx, dy);

    if (dist < minDist && dist <= node.radius + hitPadding) {
      minDist = dist;
      closest = node;
    }
  }

  return closest;
}

function cellKey(cx: number, cy: number) {
  return `${cx}:${cy}`;
}

/**
 * Uniform grid over visible nodes. Pointer queries only inspect nearby
 * cells instead of scanning the whole sky.
 */
export function createOrbitMapSpatialIndex<TNode extends OrbitMapHitTestNode>() {
  let nodes: TNode[] = [];
  let cells: Map<string, TNode[]> | null = null;
  let cellSize = 80;
  let maxRadius = 0;

  function rebuild(next: TNode[]) {
    nodes = next;
    maxRadius = 0;
    if (next.length < SPATIAL_INDEX_MIN_NODES) {
      cells = null;
      return;
    }

    for (const node of next) {
      if (node.radius > maxRadius) maxRadius = node.radius;
    }
    cellSize = Math.max(64, Math.ceil(maxRadius * 4));
    cells = new Map();

    for (const node of next) {
      const cx = Math.floor((node.x ?? 0) / cellSize);
      const cy = Math.floor((node.y ?? 0) / cellSize);
      const key = cellKey(cx, cy);
      const bucket = cells.get(key);
      if (bucket) bucket.push(node);
      else cells.set(key, [node]);
    }
  }

  function query(
    point: { x: number; y: number },
    hitPadding: number
  ): TNode | null {
    if (!cells) return findClosestOrbitMapNode(nodes, point, hitPadding);

    const reach = maxRadius + hitPadding;
    const minCx = Math.floor((point.x - reach) / cellSize);
    const maxCx = Math.floor((point.x + reach) / cellSize);
    const minCy = Math.floor((point.y - reach) / cellSize);
    const maxCy = Math.floor((point.y + reach) / cellSize);
    const candidates: TNode[] = [];

    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        const bucket = cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const node of bucket) candidates.push(node);
      }
    }

    return findClosestOrbitMapNode(candidates, point, hitPadding);
  }

  return { rebuild, query };
}
