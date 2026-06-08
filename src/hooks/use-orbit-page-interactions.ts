"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatAppliedToast } from "@/lib/orbit-apply-utils";
import { ORBIT_SHORTCUT_GROUPS } from "@/lib/orbit-client-constants";
import type { OrbitReviewSession } from "@/lib/orbit-client-constants";
import {
  scrollDataElementIntoView,
  useSurfaceKeyboardShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import type { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useBookmarkDialogs } from "@/hooks/use-bookmark-dialogs";
import type { useOrbitScan } from "@/hooks/use-orbit-scan";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
import type { BookmarkWithRelations, CollectionWithCount, TagWithCount } from "@/types";
import type { OrbitSortDirection, OrbitView } from "@/lib/orbit-navigation";

type OrbitScanApi = ReturnType<typeof useOrbitScan>;
type BookmarkActions = ReturnType<typeof useBookmarkActions>;

type UseOrbitPageInteractionsOptions = {
  actions: BookmarkActions;
  scan: OrbitScanApi;
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  bookmarks: BookmarkWithRelations[];
  bookmarkById: Map<string, BookmarkWithRelations>;
  orbitView: OrbitView;
  queueSortDirection: OrbitSortDirection;
  page: number;
  allQueueCountLabel: string;
  hasSearchQuery: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  scanTargetIds: string[];
  reviewSession: OrbitReviewSession;
  activeBookmarkId: string | null;
  setActiveBookmarkId: React.Dispatch<React.SetStateAction<string | null>>;
  selectionMode: boolean;
  setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectedBookmarkIds: Set<string>;
  setSelectedBookmarkIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setAppliedBookmarkIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleScan: () => Promise<void>;
  handleOpenReviewAll: () => void;
  handleOpenBookmarkReview: (bookmarkId: string) => void;
  handleKeepInOrbit: (bookmarkId: string) => boolean;
  handleAcceptSuggestion: (id: string) => Promise<void>;
};

export function useOrbitPageInteractions(options: UseOrbitPageInteractionsOptions) {
  const {
    actions,
    scan,
    tags,
    collections,
    bookmarks,
    bookmarkById,
    orbitView,
    queueSortDirection,
    page,
    allQueueCountLabel,
    hasSearchQuery,
    searchInputRef,
    scanTargetIds,
    reviewSession,
    activeBookmarkId,
    setActiveBookmarkId,
    selectionMode,
    setSelectionMode,
    selectedBookmarkIds,
    setSelectedBookmarkIds,
    setAppliedBookmarkIds,
    handleScan,
    handleOpenReviewAll,
    handleOpenBookmarkReview,
    handleKeepInOrbit,
    handleAcceptSuggestion,
  } = options;

  const dialogs = useBookmarkDialogs({
    bookmarkById,
    onOpenTag: setActiveBookmarkId,
    onOpenCollection: setActiveBookmarkId,
  });

  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  const resetPageUiState = useCallback(() => {
    setActiveBookmarkId(null);
    setSelectionMode(false);
    setSelectedBookmarkIds(new Set());
  }, [setActiveBookmarkId, setSelectionMode, setSelectedBookmarkIds]);

  useEffect(() => {
    if (!menuForId) return;

    const handleClickOutside = () => {
      setMenuForId(null);
      setMenuPosition(null);
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuForId(null);
        setMenuPosition(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuForId]);

  const resolvedActiveBookmarkId =
    activeBookmarkId && bookmarkById.has(activeBookmarkId) ? activeBookmarkId : null;

  const activeBookmark = resolvedActiveBookmarkId
    ? (bookmarkById.get(resolvedActiveBookmarkId) ?? null)
    : null;

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("[contenteditable='true']") !== null
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.key === "Escape") {
        if (menuForId) {
          setMenuForId(null);
          setMenuPosition(null);
        } else if (activeBookmarkId) {
          setActiveBookmarkId(null);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeBookmarkId, menuForId, setActiveBookmarkId]);

  useEffect(() => {
    if (!resolvedActiveBookmarkId) return;
    const row = document.querySelector(
      `[data-orbit-row-id="${resolvedActiveBookmarkId}"]`
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [resolvedActiveBookmarkId]);

  const activeDecision = activeBookmark ? scan.getDecision(activeBookmark.id) : null;
  const orbitOverlayOpen =
    !!activeBookmarkId &&
    !!activeBookmark &&
    !selectionMode &&
    !dialogs.tagDialogOpen &&
    !dialogs.collectionDialogOpen &&
    !reviewSession.open;

  const selectOrbitBookmarkByOffset = useCallback(
    (offset: -1 | 1) => {
      if (bookmarks.length === 0) return;
      const currentIndex = bookmarks.findIndex(
        (bookmark) => bookmark.id === resolvedActiveBookmarkId
      );
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.max(0, Math.min(bookmarks.length - 1, currentIndex + offset));
      const nextId = bookmarks[nextIndex]?.id;
      if (!nextId) return;
      setActiveBookmarkId(nextId);
      requestAnimationFrame(() =>
        scrollDataElementIntoView("data-orbit-row-id", nextId)
      );
    },
    [bookmarks, resolvedActiveBookmarkId, setActiveBookmarkId]
  );

  const orbitMapHref = useMemo(() => {
    if (!resolvedActiveBookmarkId) return "/orbit/map?scope=orbit";
    const params = new URLSearchParams({
      focus: resolvedActiveBookmarkId,
      scope: "orbit",
    });
    const decision = scan.getDecision(resolvedActiveBookmarkId);
    const primary = decision?.primary;
    if (primary?.kind === "tag") {
      const tag = tags.find((t) => t.name === primary.label);
      if (tag) params.set("anchor", tag.id);
    } else if (primary?.kind === "collection") {
      const collection = collections.find((c) => c.name === primary.label);
      if (collection) params.set("anchor", collection.id);
    }
    return `/orbit/map?${params.toString()}`;
  }, [collections, resolvedActiveBookmarkId, scan, tags]);

  const handleBookmarkAddTag = dialogs.openTagForBookmark;
  const handleBookmarkAddToCollection = dialogs.openCollectionForBookmark;

  const handleOrbitOverlayDecision = (id: string, kind: string) => {
    const decision = scan.getDecision(id);
    if (kind === "keep-tag" && decision?.primary) {
      scan
        .applySuggestion(id, "primary")
        .then((applied) => {
          if (applied) {
            setAppliedBookmarkIds((current) => {
              const next = new Set(current);
              next.add(id);
              return next;
            });
            toast.success(`Applied · ${formatAppliedToast(applied)}`);
          }
        })
        .catch(() => {
          handleOpenBookmarkReview(id);
        });
    } else if (kind === "discard") {
      actions.handleDeleteBookmark(id);
    } else if (kind === "dismiss" || kind === "archive") {
      const restored = handleKeepInOrbit(id);
      if (!restored) setActiveBookmarkId(null);
      return;
    }
    setActiveBookmarkId(null);
  };

  const handleMenuAction = (id: string, action: string) => {
    const bookmark = bookmarks.find((b) => b.id === id);
    const tweetUrl = bookmark ? getBookmarkTweetUrl(bookmark) : undefined;

    if (action === "open-x" && bookmark) {
      openBookmarkOnX(bookmark);
    } else if (action === "copy-link" && tweetUrl) {
      void navigator.clipboard.writeText(tweetUrl).then(
        () => toast.success("Link copied"),
        () => toast.error("Could not copy link")
      );
    } else if (action === "tag") {
      handleBookmarkAddTag(id);
    } else if (action === "collection") {
      handleBookmarkAddToCollection(id);
    } else if (action === "keep") {
      handleKeepInOrbit(id);
    } else if (action === "discard") {
      actions.handleDeleteBookmark(id);
    } else if (action === "archive") {
      handleKeepInOrbit(id);
    } else {
      setActiveBookmarkId(id);
    }
    setMenuForId(null);
    setMenuPosition(null);
  };

  const handleSelectAllOnPage = useCallback(() => {
    setSelectedBookmarkIds(new Set(bookmarks.map((b) => b.id)));
  }, [bookmarks, setSelectedBookmarkIds]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedBookmarkIds(new Set());
      }
      return !prev;
    });
  }, [setSelectionMode, setSelectedBookmarkIds]);

  const handleSelectionChange = useCallback(
    (bookmarkId: string, selected: boolean) => {
      setSelectedBookmarkIds((prev) => {
        const next = new Set(prev);
        if (selected) {
          next.add(bookmarkId);
        } else {
          next.delete(bookmarkId);
        }
        return next;
      });
    },
    [setSelectedBookmarkIds]
  );

  const handleBulkAddTag = useCallback(() => {
    dialogs.openTagDialog(Array.from(selectedBookmarkIds));
  }, [dialogs, selectedBookmarkIds]);

  const handleBulkAddToCollection = useCallback(() => {
    dialogs.openCollectionDialog(Array.from(selectedBookmarkIds));
  }, [dialogs, selectedBookmarkIds]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedBookmarkIds);
    if (ids.length === 0) return;
    void Promise.all(ids.map((id) => actions.handleDeleteBookmark(id)));
    setSelectedBookmarkIds(new Set());
    setSelectionMode(false);
  }, [actions, selectedBookmarkIds, setSelectedBookmarkIds, setSelectionMode]);

  const visibleStatusLabel = (() => {
    const visible = bookmarks.length;
    if (hasSearchQuery) {
      return `${visible} match${visible === 1 ? "" : "es"}`;
    }
    if (orbitView === "recent") {
      return `${visible} of ${allQueueCountLabel} ${
        queueSortDirection === "asc" ? "oldest" : "most recent"
      }`;
    }
    return `${visible} on page ${page} · ${allQueueCountLabel} total · ${
      queueSortDirection === "asc" ? "oldest first" : "newest first"
    }`;
  })();

  useSurfaceKeyboardShortcuts({
    shortcutGroups: ORBIT_SHORTCUT_GROUPS,
    actions: {
      next: () => selectOrbitBookmarkByOffset(1),
      previous: () => selectOrbitBookmarkByOffset(-1),
      search: () => searchInputRef.current?.focus(),
      shortcuts: () => setKeyboardShortcutsOpen(true),
      scan: () => {
        if (!scan.scanning && scanTargetIds.length > 0) {
          void handleScan();
        }
      },
      review: () => {
        if (scan.plan) handleOpenReviewAll();
      },
      accept: () => {
        if (activeBookmark) void handleAcceptSuggestion(activeBookmark.id);
      },
      skip: () => {
        if (activeBookmark) handleKeepInOrbit(activeBookmark.id);
      },
      edit: () => {
        if (activeBookmark && scan.plan) handleOpenBookmarkReview(activeBookmark.id);
      },
      tag: () => {
        if (activeBookmark) dialogs.openTagForBookmark(activeBookmark.id);
      },
      collection: () => {
        if (activeBookmark) dialogs.openCollectionForBookmark(activeBookmark.id);
      },
    },
  });

  return {
    tagDialogOpen: dialogs.tagDialogOpen,
    setTagDialogOpen: dialogs.setTagDialogOpen,
    collectionDialogOpen: dialogs.collectionDialogOpen,
    setCollectionDialogOpen: dialogs.setCollectionDialogOpen,
    createCollectionOpen: dialogs.createCollectionOpen,
    setCreateCollectionOpen: dialogs.setCreateCollectionOpen,
    tagTargetIds: dialogs.tagTargetIds,
    setTagTargetIds: dialogs.setTagTargetIds,
    tagDialogBookmarks: dialogs.tagDialogBookmarks,
    collectionTargetIds: dialogs.collectionTargetIds,
    setCollectionTargetIds: dialogs.setCollectionTargetIds,
    collectionDialogBookmarks: dialogs.collectionDialogBookmarks,
    dialogTagIds: dialogs.dialogTagIds,
    dialogCollectionIds: dialogs.dialogCollectionIds,
    activeBookmarkId,
    setActiveBookmarkId,
    menuForId,
    setMenuForId,
    menuPosition,
    setMenuPosition,
    resetPageUiState,
    resolvedActiveBookmarkId,
    activeBookmark,
    activeDecision,
    orbitOverlayOpen,
    orbitMapHref,
    visibleStatusLabel,
    handleCreateCollectionOpen: dialogs.handleCreateCollectionOpen,
    handleBookmarkAddTag,
    handleBookmarkAddToCollection,
    handleOrbitOverlayDecision,
    handleMenuAction,
    toggleSelectionMode,
    handleSelectionChange,
    handleSelectAllOnPage,
    handleBulkAddTag,
    handleBulkAddToCollection,
    handleBulkDelete,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
  };
}
