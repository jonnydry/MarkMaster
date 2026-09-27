import { hasOrbitMapConnection } from "@/lib/orbit-map-connections";
import type { BookmarkWithRelations, OrbitGraphNode } from "@/types";

type OrbitCollectionNode = Extract<OrbitGraphNode, { kind: "collection" }>;

export interface OrbitCollectionActionState {
  canAssign: boolean;
  canCollect: boolean;
  canCopyAsCollection: boolean;
  readOnlyReason: string | null;
}

export function getOrbitCollectionActionState(
  node: OrbitCollectionNode,
  selectedBookmarkId: string | null
): OrbitCollectionActionState {
  if (node.variant === "x_folder") {
    return {
      canAssign: false,
      canCollect: false,
      canCopyAsCollection: true,
      readOnlyReason:
        "Synced X folders are read-only. Copy this folder to make an editable collection.",
    };
  }

  const hasBookmarkSelection = Boolean(selectedBookmarkId);
  return {
    canAssign: hasBookmarkSelection,
    canCollect: hasBookmarkSelection,
    canCopyAsCollection: false,
    readOnlyReason: null,
  };
}

export interface OrbitMapArmedBookmark {
  id: string;
  authorUsername: string;
  text: string;
  /** Already on the selected hub, so Assign would change nothing. */
  assigned: boolean;
}

/**
 * The bookmark a hub's Assign acts on — the last bookmark clicked on the map,
 * or the one the Orbit queue focused — so the hub inspector can name it.
 * Graph data wins; the fetched bookmark covers one the map cap left out.
 */
export function resolveOrbitMapArmedBookmark({
  hub,
  bookmarkId,
  nodesById,
  connectionIndex,
  fetchedBookmark,
}: {
  hub: OrbitGraphNode | null;
  bookmarkId: string | null;
  nodesById: Map<string, OrbitGraphNode> | undefined;
  connectionIndex: Map<string, string[]> | null;
  fetchedBookmark: Pick<
    BookmarkWithRelations,
    "id" | "authorUsername" | "tweetText" | "tags" | "collectionItems"
  > | null;
}): OrbitMapArmedBookmark | null {
  if (!bookmarkId || !hub) return null;
  if (hub.kind !== "tag" && hub.kind !== "collection") return null;

  const node = nodesById?.get(bookmarkId);
  if (node?.kind === "bookmark") {
    return {
      id: node.id,
      authorUsername: node.authorUsername,
      text: node.title,
      assigned: hasOrbitMapConnection(connectionIndex, node.id, hub.id),
    };
  }

  if (fetchedBookmark?.id === bookmarkId) {
    return {
      id: fetchedBookmark.id,
      authorUsername: fetchedBookmark.authorUsername,
      text: fetchedBookmark.tweetText.trim().replace(/\s+/g, " "),
      assigned:
        hub.kind === "tag"
          ? fetchedBookmark.tags.some(({ tag }) => tag.id === hub.id)
          : fetchedBookmark.collectionItems.some(
              ({ collection }) => collection.id === hub.id
            ),
    };
  }

  return null;
}
