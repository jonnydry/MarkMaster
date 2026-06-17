"use client";

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

import {
  scrollDataElementIntoView,
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { bookmarkLabel } from "@/lib/collections-presentation";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import {
  collectionDetailSchema,
  shareContentSchema,
} from "@/lib/api-response-schemas";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  invalidateCollectionMembershipQueries,
  invalidateCollectionMetadataQueries,
} from "@/lib/query-invalidation";
import type { BookmarkWithRelations } from "@/types";
import type { ShareContent } from "@/lib/share-content";

export const COLLECTION_DETAIL_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Bookmarks",
    shortcuts: [
      { id: "next", keys: ["J"], label: "Next bookmark" },
      { id: "previous", keys: ["K"], label: "Previous bookmark" },
      { id: "open", keys: ["O"], label: "Open selected bookmark" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Collection",
    shortcuts: [
      { id: "back", keys: ["B"], label: "Back to collections" },
      { id: "edit-name", keys: ["E"], label: "Edit collection name" },
    ],
  },
];

export type CollectionItemRow = {
  id: string;
  sortOrder: number;
  bookmark: BookmarkWithRelations;
};

export type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isPublic: boolean;
  shareSlug: string | null;
  externalSource: string | null;
  externalSourceId: string | null;
  items: CollectionItemRow[];
  total: number;
  page: number;
  totalPages: number;
  nextCursor?: string;
};

const COLLECTION_PAGE_LIMIT = 20;

function buildCollectionQueryString(
  page: number,
  pageCursors: Record<number, string>
) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: COLLECTION_PAGE_LIMIT.toString(),
  });
  const cursor = page > 1 ? pageCursors[page] : undefined;
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params.toString();
}

export function useCollectionDetailPage(collectionId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Record<number, string>>({});
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [reordering, setReordering] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContent | null>(null);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  const queryString = useMemo(
    () => buildCollectionQueryString(page, pageCursors),
    [page, pageCursors]
  );

  const preparePageCursor = useCallback((forPage: number, cursor: string) => {
    setPageCursors((current) =>
      current[forPage] === cursor ? current : { ...current, [forPage]: cursor }
    );
  }, []);

  const {
    data: collection,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery<CollectionDetail>({
    queryKey: ["collection", collectionId, queryString],
    queryFn: async () => {
      try {
        return (await fetchJson(
          `/api/collections/${collectionId}?${queryString}`,
          undefined,
          collectionDetailSchema
        )) as unknown as CollectionDetail;
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.message.includes("404")) {
          throw new Error("NOT_FOUND");
        }
        throw new Error("LOAD_FAILED");
      }
    },
    placeholderData: keepPreviousData,
  });

  const sortedItems = useMemo(
    () =>
      collection
        ? [...collection.items].sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [collection]
  );

  const sortedBookmarkIds = useMemo(
    () => sortedItems.map((item) => item.bookmark.id),
    [sortedItems]
  );

  const aboveFoldMediaBookmarkId = useMemo(() => {
    const row = sortedItems.find((item) => {
      const media = item.bookmark.media?.[0];
      return Boolean(media?.url || media?.preview_image_url);
    });
    return row?.bookmark.id ?? null;
  }, [sortedItems]);

  const isSyncedFromX = collection?.type === "x_folder";
  const isUserCollection = collection?.type === "user_collection";
  const totalItems = collection?.total ?? sortedItems.length;
  const totalPages = collection?.totalPages ?? 1;
  const canReorder = isUserCollection && totalPages <= 1;
  const itemCountLabel = bookmarkLabel(totalItems);
  const isNotFound = error instanceof Error && error.message === "NOT_FOUND";

  const selectBookmarkByOffset = useCallback(
    (offset: -1 | 1) => {
      if (sortedBookmarkIds.length === 0) return;
      const currentIndex = activeBookmarkId
        ? sortedBookmarkIds.indexOf(activeBookmarkId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.max(
              0,
              Math.min(sortedBookmarkIds.length - 1, currentIndex + offset)
            );
      const nextId = sortedBookmarkIds[nextIndex];
      if (!nextId) return;
      setActiveBookmarkId(nextId);
      requestAnimationFrame(() =>
        scrollDataElementIntoView("data-dashboard-bookmark-id", nextId)
      );
    },
    [activeBookmarkId, sortedBookmarkIds]
  );

  const cancelEditingName = useCallback(() => {
    if (!collection) return;
    setName(collection.name);
    setEditingName(false);
  }, [collection]);

  const startEditingName = useCallback(() => {
    if (!collection) return;
    setName(collection.name ?? "");
    setEditingName(true);
  }, [collection]);

  const handleCopyAsCollection = useCallback(async () => {
    if (!collection) return;
    try {
      await copyCollectionAsUserCollection(collectionId, queryClient);
      toast.success("Copied as a new collection");
      router.push("/collections");
    } catch (copyError) {
      toast.error(
        copyError instanceof Error
          ? copyError.message
          : "Could not copy as collection"
      );
    }
  }, [collection, collectionId, queryClient, router]);

  const handleTogglePublic = useCallback(async () => {
    if (!collection) return;
    try {
      const updated = await sendJson<{ isPublic?: boolean }>(
        `/api/collections/${collectionId}`,
        {
          method: "PATCH",
          body: { isPublic: !collection.isPublic },
        }
      );
      await invalidateCollectionMetadataQueries(queryClient, collectionId);
      if (updated.isPublic) {
        toast.success("Collection is now public");
      } else {
        toast.success("Collection is now private");
      }
    } catch (toggleError) {
      toast.error(
        toggleError instanceof Error
          ? toggleError.message
          : "Could not update visibility"
      );
    }
  }, [collection, collectionId, queryClient]);

  const handleCopyShareLink = useCallback(async () => {
    if (!collection?.shareSlug) return;
    const url = `${window.location.origin}/share/${collection.shareSlug}`;
    const copied = await copyTextToClipboard(url);
    if (copied) {
      toast.success("Share link copied!");
    } else {
      toast.error("Could not copy link to clipboard");
    }
  }, [collection]);

  const handleRemoveItem = useCallback(
    async (bookmarkId: string) => {
      try {
        await sendJson(`/api/collections/${collectionId}/items`, {
          method: "DELETE",
          body: { bookmarkId },
        });
        await invalidateCollectionMembershipQueries(queryClient, collectionId);
        toast.success("Removed from collection");
      } catch (removeError) {
        toast.error(
          removeError instanceof Error
            ? removeError.message
            : "Could not remove bookmark"
        );
      }
    },
    [collectionId, queryClient]
  );

  const handleShareOnX = useCallback(async () => {
    if (!collection) return;
    try {
      const content = await fetchJson(
        `/api/collections/${collectionId}/publish`,
        { method: "POST" },
        shareContentSchema
      );
      setShareContent(content);
      setShareOpen(true);
    } catch (shareError) {
      toast.error(
        shareError instanceof Error
          ? shareError.message
          : "Could not generate share content"
      );
    }
  }, [collection, collectionId]);

  const handleUpdateName = useCallback(async () => {
    if (!collection) return;

    if (!name.trim()) {
      cancelEditingName();
      return;
    }

    try {
      await sendJson(`/api/collections/${collectionId}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
      await invalidateCollectionMetadataQueries(queryClient, collectionId);
      setEditingName(false);
      toast.success("Name updated");
    } catch (updateError) {
      toast.error(
        updateError instanceof Error ? updateError.message : "Could not update name"
      );
    }
  }, [cancelEditingName, collection, collectionId, name, queryClient]);

  const moveItem = useCallback(
    async (fromIndex: number, direction: -1 | 1) => {
      if (!collection || reordering || !canReorder) return;
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= sortedItems.length) return;

      setReordering(true);
      try {
        const next = [...sortedItems];
        [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
        const payload = next.map((item, index) => ({
          bookmarkId: item.bookmark.id,
          sortOrder: index,
        }));

        await sendJson(`/api/collections/${collectionId}/items`, {
          method: "PATCH",
          body: { items: payload },
        });
        await invalidateCollectionMembershipQueries(queryClient, collectionId);
      } catch (reorderError) {
        toast.error(
          reorderError instanceof Error
            ? reorderError.message
            : "Could not reorder items"
        );
      } finally {
        setReordering(false);
      }
    },
    [canReorder, collection, collectionId, queryClient, reordering, sortedItems]
  );

  const goToCollections = useCallback(() => {
    router.push("/collections");
  }, [router]);

  const goToDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const prefetchCollectionPage = useCallback(
    (targetPage: number) => {
      if (targetPage < 1 || targetPage > totalPages) return;
      if (targetPage === page + 1 && collection?.nextCursor) {
        preparePageCursor(targetPage, collection.nextCursor);
      }
      const params = new URLSearchParams(queryString);
      params.set("page", targetPage.toString());
      if (targetPage > 1) {
        const cursor =
          targetPage === page + 1
            ? collection?.nextCursor
            : pageCursors[targetPage];
        if (!cursor) return;
        params.set("cursor", cursor);
      } else {
        params.delete("cursor");
      }
      void queryClient.prefetchQuery({
        queryKey: ["collection", collectionId, params.toString()],
        queryFn: () =>
          fetchJson(
            `/api/collections/${collectionId}?${params.toString()}`,
            undefined,
            collectionDetailSchema
          ),
      });
    },
    [
      collection,
      collectionId,
      page,
      pageCursors,
      preparePageCursor,
      queryClient,
      queryString,
      totalPages,
    ]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage > page && collection?.nextCursor) {
        preparePageCursor(nextPage, collection.nextCursor);
      }
      setPage(nextPage);
    },
    [collection, page, preparePageCursor]
  );

  const openSelectedBookmark = useCallback(() => {
    const targetId =
      activeBookmarkId && sortedBookmarkIds.includes(activeBookmarkId)
        ? activeBookmarkId
        : sortedBookmarkIds[0];
    if (targetId) {
      router.push(`/dashboard?bookmark=${encodeURIComponent(targetId)}`);
    }
  }, [activeBookmarkId, router, sortedBookmarkIds]);

  useSurfaceKeyboardShortcuts({
    shortcutGroups: COLLECTION_DETAIL_SHORTCUT_GROUPS,
    actions: {
      next: () => selectBookmarkByOffset(1),
      previous: () => selectBookmarkByOffset(-1),
      open: openSelectedBookmark,
      back: goToCollections,
      "edit-name": () => {
        if (!collection || !isUserCollection) return;
        startEditingName();
      },
      shortcuts: () => setKeyboardShortcutsOpen(true),
    },
  });

  return {
    collection,
    isPending,
    isError,
    error,
    refetch,
    isNotFound,
    sortedItems,
    totalItems,
    totalPages,
    page,
    setPage,
    handlePageChange,
    canReorder,
    prefetchCollectionPage,
    aboveFoldMediaBookmarkId,
    isSyncedFromX,
    isUserCollection,
    itemCountLabel,
    editingName,
    name,
    setName,
    reordering,
    shareOpen,
    setShareOpen,
    shareContent,
    activeBookmarkId,
    setActiveBookmarkId,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    cancelEditingName,
    startEditingName,
    handleCopyAsCollection,
    handleTogglePublic,
    handleCopyShareLink,
    handleRemoveItem,
    handleShareOnX,
    handleUpdateName,
    moveItem,
    goToCollections,
    goToDashboard,
  };
}
