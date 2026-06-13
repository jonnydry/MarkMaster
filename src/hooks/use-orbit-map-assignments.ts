"use client";

import { useCallback, useState, type RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type {
  OrbitMapCanvasHandle,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import type { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import type { useBookmarkDialogs } from "@/hooks/use-bookmark-dialogs";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { sendJson } from "@/lib/fetch-json";
import {
  invalidateBookmarkCollectionSideEffects,
  invalidateBookmarkListQueries,
} from "@/lib/query-invalidation";
import {
  resolveOrbitMapSelectionNode,
  type buildOrbitMapGraphIndexes,
} from "@/lib/orbit-map-graph-indexes";

type GraphIndexes = ReturnType<typeof buildOrbitMapGraphIndexes>;

interface UseOrbitMapAssignmentsOptions {
  actions: ReturnType<typeof useBookmarkActions>;
  dialogs: ReturnType<typeof useBookmarkDialogs>;
  queryClient: QueryClient;
  canvasRef: RefObject<OrbitMapCanvasHandle | null>;
  graphIndexes: GraphIndexes;
  activeSelectionNode: ReturnType<typeof resolveOrbitMapSelectionNode>;
  selectedBookmarkId: string | null;
  refetch: () => Promise<unknown>;
  onSelectionChange: (selection: OrbitMapSelection | null) => void;
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
  activeSelectionNode,
  selectedBookmarkId,
  refetch,
  onSelectionChange,
}: UseOrbitMapAssignmentsOptions) {
  const [copyingCollectionId, setCopyingCollectionId] = useState<string | null>(
    null
  );

  const handleAssign = useCallback(async () => {
    if (!activeSelectionNode || !selectedBookmarkId) return;
    if (
      activeSelectionNode.kind !== "tag" &&
      activeSelectionNode.kind !== "collection"
    ) {
      return;
    }

    if (activeSelectionNode.kind === "tag") {
      await canvasRef.current?.animateAssign(
        selectedBookmarkId,
        activeSelectionNode.id
      );
      await actions.handleAddTag(
        selectedBookmarkId,
        activeSelectionNode.name,
        activeSelectionNode.color
      );
      await refetch();
      return;
    }

    if (activeSelectionNode.variant === "x_folder") return;

    await canvasRef.current?.animateAssign(
      selectedBookmarkId,
      activeSelectionNode.id
    );
    await actions.handleAddToCollection(
      selectedBookmarkId,
      activeSelectionNode.id
    );
    await refetch();
  }, [actions, activeSelectionNode, canvasRef, refetch, selectedBookmarkId]);

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

      try {
        if (anchor.kind === "tag") {
          await actions.handleAddTag(bookmarkId, anchor.name, anchor.color);
          toast.success(`Tagged #${anchor.name}`, {
            action: {
              label: "Undo",
              onClick: () => {
                void actions
                  .handleRemoveTag(bookmarkId, anchorId)
                  .then(() => refetch());
              },
            },
          });
        } else if (anchor.kind === "collection") {
          if (anchor.variant === "x_folder") {
            toast.info(
              "X folders are synced from X and can't be edited. Copy it as a collection first."
            );
            return;
          }
          await actions.handleAddToCollection(bookmarkId, anchor.id);
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
                  void refetch();
                });
              },
            },
          });
        }
        await refetch();
      } catch {
        // Failure toasts come from the underlying mutations in useBookmarkActions.
      }
    },
    [actions, graphIndexes, queryClient, refetch]
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
        await refetch();

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
    [canvasRef, onSelectionChange, queryClient, refetch]
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
