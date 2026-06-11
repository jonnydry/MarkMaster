export interface OrbitMapHitTestNode {
  id: string;
  x?: number;
  y?: number;
  radius: number;
}

/** Minimum on-screen size of a node's padded hit target, in screen pixels. */
const MIN_HIT_TARGET_SCREEN_PX = 14;

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
