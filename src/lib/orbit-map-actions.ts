import type { OrbitGraphNode } from "@/types";

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
