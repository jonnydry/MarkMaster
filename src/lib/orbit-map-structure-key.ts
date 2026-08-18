import type { OrbitGraphEdge, OrbitGraphPayload } from "@/types";

function fnv1a(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixHash(sum: number, value: string) {
  return (sum + fnv1a(value)) >>> 0;
}

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

/**
 * Stable fingerprint of graph topology — same key means layout can be
 * preserved. Hashes are mixed additively so array order does not matter
 * and we never sort or join the full node/edge lists.
 */
export function buildOrbitMapStructureKey(graph: OrbitGraphPayload) {
  let nodeHash = 0;
  for (const node of graph.nodes) {
    nodeHash = mixHash(nodeHash, `${node.kind}:${node.id}`);
  }

  let edgeHash = 0;
  for (const edge of graph.edges) {
    edgeHash = mixHash(edgeHash, edgeSignature(edge));
  }

  return `${graph.scope ?? "library"}:${graph.nodes.length}:${nodeHash}:${graph.edges.length}:${edgeHash}`;
}
