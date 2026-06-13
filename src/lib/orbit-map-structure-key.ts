import type { OrbitGraphEdge, OrbitGraphPayload } from "@/types";

function edgeSignature(edge: OrbitGraphEdge) {
  switch (edge.kind) {
    case "bookmark-tag":
      return `bt:${edge.bookmarkId}:${edge.tagId}`;
    case "bookmark-collection":
      return `bc:${edge.bookmarkId}:${edge.collectionId}`;
    case "loose":
      return `lo:${edge.bookmarkId}`;
    case "overflow":
      return `ov:${edge.overflowId}:${edge.anchorId}`;
    default:
      edge satisfies never;
      return "";
  }
}

/** Stable fingerprint of graph topology — same key means layout can be preserved. */
export function buildOrbitMapStructureKey(graph: OrbitGraphPayload) {
  const nodePart = graph.nodes
    .map((node) => `${node.kind}:${node.id}`)
    .sort()
    .join("|");

  const edgePart = graph.edges.map(edgeSignature).sort().join("|");

  return `${graph.scope ?? "library"}::${nodePart}::${edgePart}`;
}
