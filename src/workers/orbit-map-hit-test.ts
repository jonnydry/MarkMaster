export interface OrbitMapHitTestNode {
  id: string;
  x?: number;
  y?: number;
  radius: number;
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
