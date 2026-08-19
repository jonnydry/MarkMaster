import type { OrbitGraphNode, OrbitGraphPayload } from "@/types";

export type BookmarkGraphNode = Extract<OrbitGraphNode, { kind: "bookmark" }>;

export type OrbitMapGraphIndexes = {
  nodesById: Map<string, OrbitGraphNode>;
  bookmarksById: Map<string, BookmarkGraphNode>;
  bookmarkCount: number;
};

export function buildOrbitMapGraphIndexes(
  graph: OrbitGraphPayload | null | undefined
): OrbitMapGraphIndexes | null {
  if (!graph) return null;

  const nodesById = new Map<string, OrbitGraphNode>();
  const bookmarksById = new Map<string, BookmarkGraphNode>();
  let bookmarkCount = 0;

  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
    if (node.kind === "bookmark") {
      bookmarksById.set(node.id, node);
      bookmarkCount += 1;
    }
  }

  return { nodesById, bookmarksById, bookmarkCount };
}

export function resolveOrbitMapSelectionNode(
  selection: { kind: OrbitGraphNode["kind"]; id: string } | null,
  graphIndexes: OrbitMapGraphIndexes | null
): OrbitGraphNode | null {
  if (!graphIndexes || !selection) return null;
  const node = graphIndexes.nodesById.get(selection.id) ?? null;
  return node?.kind === selection.kind ? node : null;
}

/** Maps a "+N more" overflow node to the hub the inspector should show. */
export function resolveOrbitMapOverflowSelection(
  node: OrbitGraphNode | null | undefined
): {
  selection: { kind: "tag" | "collection" | "core"; id: string };
  expand: boolean;
} | null {
  if (!node || node.kind !== "overflow") return null;

  if (node.anchorKind === "tag" || node.anchorKind === "collection") {
    return {
      selection: { kind: node.anchorKind, id: node.anchorId },
      expand: true,
    };
  }

  if (node.anchorKind === "core") {
    return {
      selection: { kind: "core", id: node.anchorId },
      expand: false,
    };
  }

  return null;
}

export function buildOrbitMapFocus(
  focusBookmarkId: string | null,
  focusAnchorId: string | null,
  graphIndexes: OrbitMapGraphIndexes | null
) {
  if (!focusBookmarkId || !focusAnchorId || !graphIndexes) return null;

  const bookmark = graphIndexes.bookmarksById.get(focusBookmarkId);
  const anchor = graphIndexes.nodesById.get(focusAnchorId);
  if (!bookmark || !anchor) return null;
  if (
    anchor.kind !== "tag" &&
    anchor.kind !== "collection" &&
    anchor.kind !== "core"
  ) {
    return null;
  }

  return {
    bookmarkId: focusBookmarkId,
    predictedAnchorId: focusAnchorId,
  };
}
