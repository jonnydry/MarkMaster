import type { QueryClient } from "@tanstack/react-query";

import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphEdge, OrbitGraphNode, OrbitGraphPayload } from "@/types";

export type OrbitGraphAssignmentAction = "add" | "remove";
export type OrbitGraphAssignmentAnchor = "tag" | "collection";

export type OrbitGraphAssignment = {
  action: OrbitGraphAssignmentAction;
  bookmarkId: string;
  anchorKind: OrbitGraphAssignmentAnchor;
  anchorId: string;
};

function isAffiliationEdge(edge: OrbitGraphEdge, bookmarkId: string): boolean {
  return (
    (edge.kind === "bookmark-tag" && edge.bookmarkId === bookmarkId) ||
    (edge.kind === "bookmark-collection" && edge.bookmarkId === bookmarkId)
  );
}

function isAssignmentEdge(
  edge: OrbitGraphEdge,
  assignment: OrbitGraphAssignment
): boolean {
  if (assignment.anchorKind === "tag") {
    return (
      edge.kind === "bookmark-tag" &&
      edge.bookmarkId === assignment.bookmarkId &&
      edge.tagId === assignment.anchorId
    );
  }
  return (
    edge.kind === "bookmark-collection" &&
    edge.bookmarkId === assignment.bookmarkId &&
    edge.collectionId === assignment.anchorId
  );
}

function makeAssignmentEdge(assignment: OrbitGraphAssignment): OrbitGraphEdge {
  if (assignment.anchorKind === "tag") {
    return {
      kind: "bookmark-tag",
      bookmarkId: assignment.bookmarkId,
      tagId: assignment.anchorId,
    };
  }
  return {
    kind: "bookmark-collection",
    bookmarkId: assignment.bookmarkId,
    collectionId: assignment.anchorId,
  };
}

function bumpHubCount(node: OrbitGraphNode, delta: number): OrbitGraphNode {
  if (node.kind !== "tag" && node.kind !== "collection") return node;
  return { ...node, count: Math.max(0, node.count + delta) };
}

function syncCoreLoose(
  node: OrbitGraphNode,
  looseBookmarks: number
): OrbitGraphNode {
  if (node.kind !== "core") return node;
  return { ...node, looseBookmarks };
}

/**
 * Applies a single tag/collection membership change to a cached graph.
 * Returns null when the bookmark or hub is not in this payload (truncated
 * sky, or the assignment raced a rebuild) so the caller can refetch.
 */
export function applyOrbitGraphAssignment(
  graph: OrbitGraphPayload,
  assignment: OrbitGraphAssignment
): OrbitGraphPayload | null {
  const bookmark = graph.nodes.find(
    (node) => node.kind === "bookmark" && node.id === assignment.bookmarkId
  );
  const hub = graph.nodes.find(
    (node) =>
      node.kind === assignment.anchorKind && node.id === assignment.anchorId
  );
  if (!bookmark || !hub) return null;

  const alreadyAssigned = graph.edges.some((edge) =>
    isAssignmentEdge(edge, assignment)
  );
  if (assignment.action === "add" && alreadyAssigned) return graph;
  if (assignment.action === "remove" && !alreadyAssigned) return graph;

  const nextEdges = graph.edges.filter(
    (edge) => !isAssignmentEdge(edge, assignment)
  );
  if (assignment.action === "add") {
    nextEdges.push(makeAssignmentEdge(assignment));
  }

  const wasLoose = graph.edges.some(
    (edge) => edge.kind === "loose" && edge.bookmarkId === assignment.bookmarkId
  );
  const affiliated = nextEdges.some((edge) =>
    isAffiliationEdge(edge, assignment.bookmarkId)
  );
  const nextLoose = affiliated
    ? nextEdges.filter(
        (edge) =>
          !(edge.kind === "loose" && edge.bookmarkId === assignment.bookmarkId)
      )
    : nextEdges.some(
          (edge) =>
            edge.kind === "loose" && edge.bookmarkId === assignment.bookmarkId
        )
      ? nextEdges
      : [...nextEdges, { kind: "loose" as const, bookmarkId: assignment.bookmarkId }];

  const becameAffiliated = wasLoose && affiliated;
  const becameLoose = !wasLoose && !affiliated;
  const hubDelta = assignment.action === "add" ? 1 : -1;
  const looseDelta = becameAffiliated ? -1 : becameLoose ? 1 : 0;
  const nextLooseCount = Math.max(0, graph.stats.looseBookmarks + looseDelta);
  const nextAffiliatedCount = Math.max(
    0,
    graph.stats.affiliatedBookmarks - looseDelta
  );

  return {
    ...graph,
    generatedAt: new Date().toISOString(),
    nodes: graph.nodes.map((node) => {
      if (node.kind === "bookmark" && node.id === assignment.bookmarkId) {
        return { ...node, affiliated };
      }
      if (node.id === assignment.anchorId) {
        return bumpHubCount(node, hubDelta);
      }
      return syncCoreLoose(node, nextLooseCount);
    }),
    edges: nextLoose,
    stats: {
      ...graph.stats,
      affiliatedBookmarks: nextAffiliatedCount,
      looseBookmarks: nextLooseCount,
    },
  };
}

/** Patches every cached orbit-graph query. Returns false when a refetch is needed. */
export function patchOrbitGraphAssignment(
  queryClient: QueryClient,
  assignment: OrbitGraphAssignment
): boolean {
  const snapshots = queryClient.getQueriesData<OrbitGraphPayload>({
    queryKey: ORBIT_GRAPH_QUERY_KEY,
  });
  if (snapshots.length === 0) return false;

  let applied = true;
  queryClient.setQueriesData<OrbitGraphPayload>(
    { queryKey: ORBIT_GRAPH_QUERY_KEY },
    (current) => {
      if (!current) return current;
      const next = applyOrbitGraphAssignment(current, assignment);
      if (!next) {
        applied = false;
        return current;
      }
      return next;
    }
  );
  return applied;
}
