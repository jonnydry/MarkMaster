"use client";

import { useCallback, useState, type RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

import type {
  OrbitMapCanvasHandle,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import type { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import type { useBookmarkDialogs } from "@/hooks/use-bookmark-dialogs";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { sendJson } from "@/lib/fetch-json";
import { patchOrbitGraphAssignment } from "@/lib/orbit-graph-assign";
import type { OrbitMapArmedBookmark } from "@/lib/orbit-map-actions";
import { hasOrbitMapConnection } from "@/lib/orbit-map-connections";
import {
  invalidateBookmarkCollectionSideEffects,
  invalidateBookmarkListQueries,
} from "@/lib/query-invalidation";
import {
  resolveOrbitMapSelectionNode,
  type buildOrbitMapGraphIndexes,
} from "@/lib/orbit-map-graph-indexes";
import type { OrbitGraphNode } from "@/types";

type GraphIndexes = ReturnType<typeof buildOrbitMapGraphIndexes>;

interface UseOrbitMapAssignmentsOptions {
  actions: ReturnType<typeof useBookmarkActions>;
  dialogs: ReturnType<typeof useBookmarkDialogs>;
  queryClient: QueryClient;
  canvasRef: RefObject<OrbitMapCanvasHandle | null>;
  graphIndexes: GraphIndexes;
  connectionIndex: Map<string, string[]> | null;
  activeSelectionNode: ReturnType<typeof resolveOrbitMapSelectionNode>;
  selectedBookmarkId: string | null;
  armedBookmark: OrbitMapArmedBookmark | null;
  refetch: () => Promise<unknown>;
  onSelectionChange: (selection: OrbitMapSelection | null) => void;
}

function applyAssignmentOrRefetch(
  queryClient: QueryClient,
  refetch: () => Promise<unknown>,
  assignment: Parameters<typeof patchOrbitGraphAssignment>[1]
) {
  if (!patchOrbitGraphAssignment(queryClient, assignment)) {
    void refetch();
  }
}

/**
 * Tag/collection assignment flows for the graph: keyboard assign, drag-drop
 * onto hubs (with undo toasts), dialog openers, and copy-as-collection.
 */
export function useOrbitMapAssignments({
  actions,
  dialogs,
  queryClient,
  canvasRef,
  graphIndexes,
  connectionIndex,
  activeSelectionNode,
  selectedBookmarkId,
  armedBookmark,
  refetch,
  onSelectionChange,
}: UseOrbitMapAssignmentsOptions) {
  const [copyingCollectionId, setCopyingCollectionId] = useState<string | null>(
    null
  );

  // One path for both drag-drop and the inspector's Assign: skip no-op
  // assignments (their "Undo" would remove a link the bookmark already had),
  // then tag/collect with a success toast that can undo it.
  const assignToAnchor = useCallback(
    async (
      bookmarkId: string,
      anchor: OrbitGraphNode,
      options: { animate?: boolean; alreadyAssigned?: boolean } = {}
    ) => {
      if (anchor.kind !== "tag" && anchor.kind !== "collection") return;

      if (
        options.alreadyAssigned ||
        hasOrbitMapConnection(connectionIndex, bookmarkId, anchor.id)
      ) {
        toast.info(
          anchor.kind === "tag"
            ? `Already tagged #${anchor.name}`
            : `Already in ${anchor.name}`
        );
        return;
      }

      if (anchor.kind === "collection" && anchor.variant === "x_folder") {
        toast.info(
          "X folders are synced from X and can't be edited. Copy it as a collection first."
        );
        return;
      }

      try {
        if (options.animate) {
          await canvasRef.current?.animateAssign(bookmarkId, anchor.id);
        }

        if (anchor.kind === "tag") {
          await actions.handleAddTag(bookmarkId, anchor.name, anchor.color);
          applyAssignmentOrRefetch(queryClient, refetch, {
            action: "add",
            bookmarkId,
            anchorKind: "tag",
            anchorId: anchor.id,
          });
          toast.success(`Tagged #${anchor.name}`, {
            action: {
              label: "Undo",
              onClick: () => {
                void actions.handleRemoveTag(bookmarkId, anchor.id).then(() => {
                  applyAssignmentOrRefetch(queryClient, refetch, {
                    action: "remove",
                    bookmarkId,
                    anchorKind: "tag",
                    anchorId: anchor.id,
                  });
                });
              },
            },
          });
          return;
        }

        await actions.handleAddToCollection(bookmarkId, anchor.id);
        applyAssignmentOrRefetch(queryClient, refetch, {
          action: "add",
          bookmarkId,
          anchorKind: "collection",
          anchorId: anchor.id,
        });
        toast.success(`Added to ${anchor.name}`, {
          action: {
            label: "Undo",
            onClick: () => {
              void sendJson(`/api/collections/${anchor.id}/items`, {
                method: "DELETE",
                body: { bookmarkIds: [bookmarkId] },
              }).then(() => {
                void invalidateBookmarkListQueries(queryClient);
                void invalidateBookmarkCollectionSideEffects(
                  queryClient,
                  anchor.id
                );
                applyAssignmentOrRefetch(queryClient, refetch, {
                  action: "remove",
                  bookmarkId,
                  anchorKind: "collection",
                  anchorId: anchor.id,
                });
              });
            },
          },
        });
      } catch {
        // Failure toasts come from the underlying mutations in useBookmarkActions.
      }
    },
    [actions, canvasRef, connectionIndex, queryClient, refetch]
  );

  const handleAssign = useCallback(async () => {
    if (!activeSelectionNode || !selectedBookmarkId) return;
    await assignToAnchor(selectedBookmarkId, activeSelectionNode, {
      animate: true,
      alreadyAssigned:
        armedBookmark?.id === selectedBookmarkId && armedBookmark.assigned,
    });
  }, [activeSelectionNode, armedBookmark, assignToAnchor, selectedBookmarkId]);

  const handleNodeDropped = useCallback(
    async (
      bookmarkId: string,
      anchorId: string,
      anchorKind: "tag" | "collection"
    ) => {
      const anchor = resolveOrbitMapSelectionNode(
        { kind: anchorKind, id: anchorId },
        graphIndexes
      );
      if (!anchor) return;
      await assignToAnchor(bookmarkId, anchor);
    },
    [assignToAnchor, graphIndexes]
  );

  const openTagDialog = useCallback(() => {
    if (selectedBookmarkId) {
      dialogs.openTagForBookmark(selectedBookmarkId);
    }
  }, [dialogs, selectedBookmarkId]);

  const openCollectionDialog = useCallback(() => {
    if (selectedBookmarkId) {
      dialogs.openCollectionForBookmark(selectedBookmarkId);
    }
  }, [dialogs, selectedBookmarkId]);

  const handleCopyAsCollection = useCallback(
    async (collectionId: string) => {
      setCopyingCollectionId(collectionId);
      try {
        const copied = await copyCollectionAsUserCollection(
          collectionId,
          queryClient
        );

        const nextSelection: OrbitMapSelection = {
          kind: "collection",
          id: copied.id,
        };
        onSelectionChange(nextSelection);
        window.setTimeout(() => {
          canvasRef.current?.focusOn(nextSelection);
        }, 60);
        toast.success("Copied as a new collection");
      } catch (copyError) {
        toast.error(
          copyError instanceof Error
            ? copyError.message
            : "Could not copy as collection"
        );
      } finally {
        setCopyingCollectionId(null);
      }
    },
    [canvasRef, onSelectionChange, queryClient]
  );

  return {
    copyingCollectionId,
    handleAssign,
    handleNodeDropped,
    openTagDialog,
    openCollectionDialog,
    handleCopyAsCollection,
  };
}
