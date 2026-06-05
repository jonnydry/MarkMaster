import type { OrbitGraphNode, OrbitGraphPayload } from "@/types";

function addConnection(
  map: Map<string, Set<string>>,
  sourceId: string,
  targetId: string
) {
  const existing = map.get(sourceId);
  if (existing) {
    existing.add(targetId);
  } else {
    map.set(sourceId, new Set([targetId]));
  }
}

export function buildOrbitMapConnectionIndex(
  edges: OrbitGraphPayload["edges"]
): Map<string, string[]> {
  const connections = new Map<string, Set<string>>();

  for (const edge of edges) {
    switch (edge.kind) {
      case "bookmark-tag":
        addConnection(connections, edge.tagId, edge.bookmarkId);
        addConnection(connections, edge.bookmarkId, edge.tagId);
        break;
      case "bookmark-collection":
        addConnection(connections, edge.collectionId, edge.bookmarkId);
        addConnection(connections, edge.bookmarkId, edge.collectionId);
        break;
      case "loose":
        addConnection(connections, "orbit-index", edge.bookmarkId);
        addConnection(connections, edge.bookmarkId, "orbit-index");
        break;
      case "overflow":
        addConnection(connections, edge.anchorId, edge.overflowId);
        addConnection(connections, edge.overflowId, edge.anchorId);
        break;
    }
  }

  return new Map(
    [...connections.entries()].map(([sourceId, targetIds]) => [
      sourceId,
      [...targetIds],
    ])
  );
}

export function getConnectedOrbitMapNodes(
  nodeId: string,
  nodeById: Map<string, OrbitGraphNode>,
  connectionIndex: Map<string, string[]>
) {
  return (connectionIndex.get(nodeId) ?? [])
    .map((connectedId) => nodeById.get(connectedId))
    .filter((node): node is OrbitGraphNode => Boolean(node));
}
