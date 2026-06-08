"use client";

import { useCallback, useMemo, useState } from "react";

import {
  getSharedCollectionIds,
  getSharedTagIds,
} from "@/lib/bookmark-batch-utils";
import {
  pickDialogTargetIds,
  resolveDialogBookmarks,
} from "@/lib/bookmark-dialog-utils";
import type { BookmarkWithRelations } from "@/types";

type UseBookmarkDialogsOptions = {
  bookmarkById?: Map<string, BookmarkWithRelations>;
  /** When set and non-empty, dialog targets use these ids (dashboard bulk selection). */
  bulkSelectionIds?: string[];
  /** Bookmarks resolved outside the id map (e.g. orbit map focus query). */
  externalBookmarks?: BookmarkWithRelations[];
  onOpenTag?: (bookmarkId: string) => void;
  onOpenCollection?: (bookmarkId: string) => void;
  onDialogClose?: () => void;
};

export function useBookmarkDialogs(options: UseBookmarkDialogsOptions = {}) {
  const {
    bookmarkById = new Map(),
    bulkSelectionIds,
    externalBookmarks = [],
    onOpenTag,
    onOpenCollection,
    onDialogClose,
  } = options;

  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [tagTargetIds, setTagTargetIds] = useState<string[]>([]);
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);

  const activeTagTargetIds = useMemo(
    () => pickDialogTargetIds(tagTargetIds, bulkSelectionIds),
    [bulkSelectionIds, tagTargetIds]
  );

  const activeCollectionTargetIds = useMemo(
    () => pickDialogTargetIds(collectionTargetIds, bulkSelectionIds),
    [bulkSelectionIds, collectionTargetIds]
  );

  const tagDialogBookmarks = useMemo(
    () => resolveDialogBookmarks(bookmarkById, activeTagTargetIds, externalBookmarks),
    [activeTagTargetIds, bookmarkById, externalBookmarks]
  );

  const collectionDialogBookmarks = useMemo(
    () =>
      resolveDialogBookmarks(
        bookmarkById,
        activeCollectionTargetIds,
        externalBookmarks
      ),
    [activeCollectionTargetIds, bookmarkById, externalBookmarks]
  );

  const dialogTagIds = useMemo(
    () => getSharedTagIds(tagDialogBookmarks),
    [tagDialogBookmarks]
  );

  const dialogCollectionIds = useMemo(
    () => getSharedCollectionIds(collectionDialogBookmarks),
    [collectionDialogBookmarks]
  );

  const openTagDialog = useCallback((bookmarkIds: string[]) => {
    if (bookmarkIds.length === 0) return;
    setTagTargetIds(bookmarkIds);
    setTagDialogOpen(true);
  }, []);

  const openCollectionDialog = useCallback((bookmarkIds: string[]) => {
    if (bookmarkIds.length === 0) return;
    setCollectionTargetIds(bookmarkIds);
    setCollectionDialogOpen(true);
  }, []);

  const openTagForBookmark = useCallback(
    (bookmarkId: string) => {
      onOpenTag?.(bookmarkId);
      openTagDialog([bookmarkId]);
    },
    [onOpenTag, openTagDialog]
  );

  const openCollectionForBookmark = useCallback(
    (bookmarkId: string) => {
      onOpenCollection?.(bookmarkId);
      openCollectionDialog([bookmarkId]);
    },
    [onOpenCollection, openCollectionDialog]
  );

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateCollectionOpen(true);
  }, []);

  const handleTagDialogOpenChange = useCallback(
    (open: boolean) => {
      setTagDialogOpen(open);
      if (!open) {
        setTagTargetIds([]);
        onDialogClose?.();
      }
    },
    [onDialogClose]
  );

  const handleCollectionDialogOpenChange = useCallback(
    (open: boolean) => {
      setCollectionDialogOpen(open);
      if (!open) {
        setCollectionTargetIds([]);
        onDialogClose?.();
      }
    },
    [onDialogClose]
  );

  return {
    tagDialogOpen,
    setTagDialogOpen: handleTagDialogOpenChange,
    collectionDialogOpen,
    setCollectionDialogOpen: handleCollectionDialogOpenChange,
    createCollectionOpen,
    setCreateCollectionOpen,
    tagTargetIds: activeTagTargetIds,
    setTagTargetIds,
    collectionTargetIds: activeCollectionTargetIds,
    setCollectionTargetIds,
    tagDialogBookmarks,
    collectionDialogBookmarks,
    dialogTagIds,
    dialogCollectionIds,
    openTagDialog,
    openCollectionDialog,
    openTagForBookmark,
    openCollectionForBookmark,
    handleCreateCollectionOpen,
  };
}
