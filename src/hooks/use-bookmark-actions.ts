"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";

function asBookmarkIds(bookmarkIds: string | string[]) {
  return Array.isArray(bookmarkIds) ? bookmarkIds : [bookmarkIds];
}

function getBookmarkLabel(count: number) {
  return `${count} bookmark${count === 1 ? "" : "s"}`;
}

export function useBookmarkActions() {
  const queryClient = useQueryClient();

  const refreshAll = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
  }, [queryClient]);

  const handleAddTag = useCallback(async (
    bookmarkIds: string | string[],
    name: string,
    color: string
  ) => {
    const targets = asBookmarkIds(bookmarkIds);
    try {
      await sendJson("/api/tags", {
        method: "POST",
        body: { bookmarkIds: targets, name, color },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success(
        targets.length === 1
          ? "Tag added"
          : `Tag added to ${getBookmarkLabel(targets.length)}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add tag"
      );
    }
  }, [queryClient]);

  const handleRemoveTag = useCallback(async (bookmarkIds: string | string[], tagId: string) => {
    const targets = asBookmarkIds(bookmarkIds);
    try {
      await sendJson("/api/tags", {
        method: "DELETE",
        body: { bookmarkIds: targets, tagId },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success(
        targets.length === 1
          ? "Tag removed"
          : `Tag removed from ${getBookmarkLabel(targets.length)}`
      );
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
    bookmarkIds: string | string[],
    collectionId: string
  ) => {
    const targets = asBookmarkIds(bookmarkIds);
    try {
      await sendJson(`/api/collections/${collectionId}/items`, {
        method: "POST",
        body: { bookmarkIds: targets },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success(
        targets.length === 1
          ? "Added to collection"
          : `Added ${getBookmarkLabel(targets.length)} to the collection`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add to collection"
      );
    }
  }, [queryClient]);

  const handleDeleteBookmark = useCallback(async (bookmarkIds: string | string[]) => {
    const targets = asBookmarkIds(bookmarkIds);
    try {
      await sendJson("/api/bookmarks", {
        method: "DELETE",
        body: { bookmarkIds: targets },
      });
      await invalidateLibraryQueries(queryClient);
      toast.success(
        targets.length === 1
          ? "Hidden from MarkMaster"
          : `Hidden ${getBookmarkLabel(targets.length)} from MarkMaster`
      );
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
