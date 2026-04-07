"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useBookmarkActions() {
  const queryClient = useQueryClient();

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
  }, [queryClient]);

  const handleAddTag = useCallback(async (
    bookmarkId: string,
    name: string,
    color: string
  ) => {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId, name, color }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error || "Could not add tag");
      return;
    }
    refreshAll();
    toast.success("Tag added");
  }, [refreshAll]);

  const handleRemoveTag = useCallback(async (bookmarkId: string, tagId: string) => {
    const res = await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId, tagId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error || "Could not remove tag");
      return;
    }
    refreshAll();
  }, [refreshAll]);

  const handleAddNote = useCallback(async (bookmarkId: string, content: string) => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error || "Could not save note");
      return;
    }
    refreshAll();
    toast.success("Note saved");
  }, [refreshAll]);

  const handleAddToCollection = useCallback(async (
    bookmarkId: string,
    collectionId: string
  ) => {
    const res = await fetch(`/api/collections/${collectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error || "Could not add to collection");
      return;
    }
    refreshAll();
    toast.success("Added to collection");
  }, [refreshAll]);

  const handleDeleteBookmark = useCallback(async (bookmarkId: string) => {
    const res = await fetch("/api/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        (data as { error?: string }).error || "Could not remove bookmark"
      );
      return;
    }
    refreshAll();
    toast.success("Hidden from MarkMaster");
  }, [refreshAll]);

  return {
    refreshAll,
    handleAddTag,
    handleRemoveTag,
    handleAddNote,
    handleAddToCollection,
    handleDeleteBookmark,
  };
}
