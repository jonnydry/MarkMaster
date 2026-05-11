import { describe, expect, it } from "vitest";

import { getOrbitCollectionActionState } from "@/lib/orbit-map-actions";
import type { OrbitGraphNode } from "@/types";

const userCollectionNode: Extract<OrbitGraphNode, { kind: "collection" }> = {
  kind: "collection",
  id: "collection-1",
  name: "Research",
  variant: "user_collection",
  count: 12,
};

const xFolderNode: Extract<OrbitGraphNode, { kind: "collection" }> = {
  kind: "collection",
  id: "x-folder-1",
  name: "Launch Reads",
  variant: "x_folder",
  count: 3,
};

describe("getOrbitCollectionActionState", () => {
  it("offers copy as collection for synced X folder nodes", () => {
    expect(getOrbitCollectionActionState(xFolderNode, null)).toEqual({
      canAssign: false,
      canCollect: false,
      canCopyAsCollection: true,
      readOnlyReason:
        "Synced X folders are read-only. Copy this folder to make an editable collection.",
    });
  });

  it("keeps user collection assignment tied to a selected bookmark", () => {
    expect(getOrbitCollectionActionState(userCollectionNode, null)).toEqual({
      canAssign: false,
      canCollect: false,
      canCopyAsCollection: false,
      readOnlyReason: null,
    });

    expect(getOrbitCollectionActionState(userCollectionNode, "bookmark-1")).toEqual(
      {
        canAssign: true,
        canCollect: true,
        canCopyAsCollection: false,
        readOnlyReason: null,
      }
    );
  });
});
