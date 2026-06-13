"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendJson } from "@/lib/fetch-json";
import {
  invalidateBookmarkCollectionSideEffects,
  invalidateBookmarkDeletionSideEffects,
  invalidateBookmarkListQueries,
  invalidateBookmarkTagSideEffects,
  invalidateLibraryQueries,
} from "@/lib/query-invalidation";
import type { BookmarkWithRelations } from "@/types";

function asBookmarkIds(bookmarkIds: string | string[]) {
  return Array.isArray(bookmarkIds) ? bookmarkIds : [bookmarkIds];
}

type BookmarkQueryData = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages: number;
  nextCursor?: string;
};

type TagResponse = { id: string; name: string; color: string };
type NoteResponse = { id: string; content: string };

function patchBookmarkQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: (bookmark: BookmarkWithRelations) => BookmarkWithRelations
) {
  queryClient.setQueriesData<BookmarkQueryData>(
    { queryKey: ["bookmarks"] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        bookmarks: old.bookmarks.map(patch),
      };
    }
  );
}

export function useBookmarkActions() {
  const queryClient = useQueryClient();

  const refreshAll = useCallback(() => {
    void invalidateLibraryQueries(queryClient);
  }, [queryClient]);

  const addTagMutation = useMutation({
    mutationFn: async ({
      bookmarkIds,
      name,
      color,
    }: {
      bookmarkIds: string[];
      name: string;
      color: string;
    }) => {
      return sendJson<TagResponse>("/api/tags", {
        method: "POST",
        body: { bookmarkIds, name, color },
      });
    },
    onMutate: async ({ bookmarkIds, name, color }) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueriesData<BookmarkQueryData>({
        queryKey: ["bookmarks"],
      });

      const tempTag = { id: `temp-tag-${Date.now()}`, name, color };

      queryClient.setQueriesData<BookmarkQueryData>(
        { queryKey: ["bookmarks"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            bookmarks: old.bookmarks.map((b) => {
              if (!bookmarkIds.includes(b.id)) return b;
              const exists = b.tags.some((t) => t.tag.name === name);
              if (exists) return b;
              return { ...b, tags: [...b.tags, { tag: tempTag }] };
            }),
          };
        }
      );

      return { previous };
    },
    onSuccess: (tag, { bookmarkIds, name }) => {
      patchBookmarkQueries(queryClient, (bookmark) => {
        if (!bookmarkIds.includes(bookmark.id)) return bookmark;
        return {
          ...bookmark,
          tags: bookmark.tags.map((entry) =>
            entry.tag.name === name && entry.tag.id.startsWith("temp-tag-")
              ? { tag: { id: tag.id, name: tag.name, color: tag.color } }
              : entry
          ),
        };
      });
    },
    onError: (err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(err instanceof Error ? err.message : "Could not add tag");
    },
    onSettled: () => {
      void invalidateBookmarkTagSideEffects(queryClient);
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async ({
      bookmarkIds,
      tagId,
    }: {
      bookmarkIds: string[];
      tagId: string;
    }) => {
      await sendJson("/api/tags", {
        method: "DELETE",
        body: { bookmarkIds, tagId },
      });
    },
    onMutate: async ({ bookmarkIds, tagId }) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueriesData<BookmarkQueryData>({
        queryKey: ["bookmarks"],
      });

      queryClient.setQueriesData<BookmarkQueryData>(
        { queryKey: ["bookmarks"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            bookmarks: old.bookmarks.map((b) => {
              if (!bookmarkIds.includes(b.id)) return b;
              return {
                ...b,
                tags: b.tags.filter((t) => t.tag.id !== tagId),
              };
            }),
          };
        }
      );

      return { previous };
    },
    onError: (err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(err instanceof Error ? err.message : "Could not remove tag");
    },
    onSettled: () => {
      void invalidateBookmarkTagSideEffects(queryClient);
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({
      bookmarkId,
      content,
    }: {
      bookmarkId: string;
      content: string;
    }) => {
      return sendJson<NoteResponse>("/api/notes", {
        method: "POST",
        body: { bookmarkId, content },
      });
    },
    onMutate: async ({ bookmarkId, content }) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueriesData<BookmarkQueryData>({
        queryKey: ["bookmarks"],
      });

      const tempNote = { id: `temp-note-${Date.now()}`, content };

      queryClient.setQueriesData<BookmarkQueryData>(
        { queryKey: ["bookmarks"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            bookmarks: old.bookmarks.map((b) => {
              if (b.id !== bookmarkId) return b;
              return { ...b, notes: [tempNote] };
            }),
          };
        }
      );

      return { previous };
    },
    onSuccess: (note, { bookmarkId }) => {
      patchBookmarkQueries(queryClient, (bookmark) => {
        if (bookmark.id !== bookmarkId) return bookmark;
        return {
          ...bookmark,
          notes: [{ id: note.id, content: note.content }],
        };
      });
    },
    onError: (err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(err instanceof Error ? err.message : "Could not save note");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async ({ noteId }: { noteId: string }) => {
      await sendJson("/api/notes", {
        method: "DELETE",
        body: { noteId },
      });
    },
    onMutate: async ({ noteId }) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueriesData<BookmarkQueryData>({
        queryKey: ["bookmarks"],
      });

      queryClient.setQueriesData<BookmarkQueryData>(
        { queryKey: ["bookmarks"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            bookmarks: old.bookmarks.map((bookmark) => ({
              ...bookmark,
              notes: bookmark.notes.filter((note) => note.id !== noteId),
            })),
          };
        }
      );

      return { previous };
    },
    onError: (err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(err instanceof Error ? err.message : "Could not delete note");
    },
  });

  const addToCollectionMutation = useMutation({
    mutationFn: async ({
      bookmarkIds,
      collectionId,
    }: {
      bookmarkIds: string[];
      collectionId: string;
    }) => {
      await sendJson(`/api/collections/${collectionId}/items`, {
        method: "POST",
        body: { bookmarkIds },
      });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Could not add to collection"
      );
    },
    onSettled: (_data, _err, vars) => {
      void invalidateBookmarkListQueries(queryClient);
      void invalidateBookmarkCollectionSideEffects(queryClient, vars.collectionId);
    },
  });

  const deleteBookmarkMutation = useMutation({
    mutationFn: async ({ bookmarkIds }: { bookmarkIds: string[] }) => {
      await sendJson("/api/bookmarks", {
        method: "DELETE",
        body: { bookmarkIds },
      });
    },
    onMutate: async ({ bookmarkIds }) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const previous = queryClient.getQueriesData<BookmarkQueryData>({
        queryKey: ["bookmarks"],
      });

      queryClient.setQueriesData<BookmarkQueryData>(
        { queryKey: ["bookmarks"] },
        (old) => {
          if (!old) return old;
          const idSet = new Set(bookmarkIds);
          return {
            ...old,
            bookmarks: old.bookmarks.filter((b) => !idSet.has(b.id)),
            total: Math.max(0, old.total - bookmarkIds.length),
          };
        }
      );

      return { previous };
    },
    onError: (err, _vars, context) => {
      context?.previous?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast.error(
        err instanceof Error ? err.message : "Could not remove bookmark"
      );
    },
    onSettled: () => {
      void invalidateBookmarkDeletionSideEffects(queryClient);
    },
  });

  return useMemo(
    () => ({
      refreshAll,
      handleAddTag: (bookmarkIds: string | string[], name: string, color: string) =>
        addTagMutation
          .mutateAsync({ bookmarkIds: asBookmarkIds(bookmarkIds), name, color })
          .then(() => undefined),
      handleRemoveTag: (bookmarkIds: string | string[], tagId: string) =>
        removeTagMutation.mutateAsync({ bookmarkIds: asBookmarkIds(bookmarkIds), tagId }),
      handleAddNote: (bookmarkId: string, content: string) =>
        addNoteMutation.mutateAsync({ bookmarkId, content }).then(() => undefined),
      handleDeleteNote: (noteId: string) =>
        deleteNoteMutation.mutateAsync({ noteId }),
      handleAddToCollection: (bookmarkIds: string | string[], collectionId: string) =>
        addToCollectionMutation.mutateAsync({
          bookmarkIds: asBookmarkIds(bookmarkIds),
          collectionId,
        }),
      handleDeleteBookmark: (bookmarkIds: string | string[]) =>
        deleteBookmarkMutation.mutateAsync({ bookmarkIds: asBookmarkIds(bookmarkIds) }),
      isAddingTag: addTagMutation.isPending,
      isRemovingTag: removeTagMutation.isPending,
      isAddingNote: addNoteMutation.isPending,
      isDeletingNote: deleteNoteMutation.isPending,
      isAddingToCollection: addToCollectionMutation.isPending,
      isDeletingBookmark: deleteBookmarkMutation.isPending,
    }),
    [
      refreshAll,
      addTagMutation,
      removeTagMutation,
      addNoteMutation,
      deleteNoteMutation,
      addToCollectionMutation,
      deleteBookmarkMutation,
    ]
  );
}
