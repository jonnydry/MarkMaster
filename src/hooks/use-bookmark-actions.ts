"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";

export function useBookmarkActions() {
  const queryClient = useQueryClient();

  const refreshAll = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
  }, [queryClient]);

  const handleAddTag = useCallback(async (
    bookmarkId: string,
    name: string,
    color: string
  ) => {
    try {
      await sendJson("/api/tags", {
        method: "POST",
        body: { bookmarkId, name, color },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success("Tag added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add tag"
      );
    }
  }, [queryClient]);

  const handleRemoveTag = useCallback(async (bookmarkId: string, tagId: string) => {
    try {
      await sendJson("/api/tags", {
        method: "DELETE",
        body: { bookmarkId, tagId },
      });
      await invalidateLibraryQueries(queryClient);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove tag"
      );
    }
  }, [queryClient]);

  const handleAddNote = useCallback(async (bookmarkId: string, content: string) => {
    try {
      await sendJson("/api/notes", {
        method: "POST",
        body: { bookmarkId, content },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success("Note saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save note"
      );
    }
  }, [queryClient]);

  const handleAddToCollection = useCallback(async (
    bookmarkId: string,
    collectionId: string
  ) => {
    try {
      await sendJson(`/api/collections/${collectionId}/items`, {
        method: "POST",
        body: { bookmarkId },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success("Added to collection");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add to collection"
      );
    }
  }, [queryClient]);

  const handleDeleteBookmark = useCallback(async (bookmarkId: string) => {
    try {
      await sendJson("/api/bookmarks", {
        method: "DELETE",
        body: { bookmarkId },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success("Hidden from MarkMaster");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove bookmark"
      );
    }
  }, [queryClient]);

  return {
    refreshAll,
    handleAddTag,
    handleRemoveTag,
    handleAddNote,
    handleAddToCollection,
    handleDeleteBookmark,
  };
}
