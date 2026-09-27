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

/** True when the graph already links the two nodes (e.g. bookmark ↔ tag). */
export function hasOrbitMapConnection(
  connectionIndex: Map<string, string[]> | null | undefined,
  nodeId: string,
  otherId: string
) {
  return connectionIndex?.get(nodeId)?.includes(otherId) ?? false;
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

export type OrbitMapHubNode = Extract<
  OrbitGraphNode,
  { kind: "tag" | "collection" }
>;

/**
 * Other tags/collections that share bookmarks with a hub, most shared first.
 * Drives the inspector's "Shares bookmarks with" row.
 */
export function getSharedOrbitMapHubs(
  hubId: string,
  nodeById: Map<string, OrbitGraphNode>,
  connectionIndex: Map<string, string[]>,
  limit = 6
): Array<{ node: OrbitMapHubNode; count: number }> {
  const counts = new Map<string, number>();
  for (const bookmarkId of connectionIndex.get(hubId) ?? []) {
    if (nodeById.get(bookmarkId)?.kind !== "bookmark") continue;
    for (const otherId of connectionIndex.get(bookmarkId) ?? []) {
      if (otherId === hubId) continue;
      const kind = nodeById.get(otherId)?.kind;
      if (kind !== "tag" && kind !== "collection") continue;
      counts.set(otherId, (counts.get(otherId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ node: nodeById.get(id) as OrbitMapHubNode, count }))
    .sort((a, b) => b.count - a.count || a.node.name.localeCompare(b.node.name))
    .slice(0, limit);
}
