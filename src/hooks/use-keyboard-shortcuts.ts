"use client";

import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  activeBookmarkId: string | null;
  bookmarks: { id: string }[];
  onNavigate: (id: string | null) => void;
  onTag: () => void;
  onCollection: () => void;
  onNote: () => void;
}

export function useKeyboardShortcuts({
  activeBookmarkId,
  bookmarks,
  onNavigate,
  onTag,
  onCollection,
  onNote,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const currentIndex = bookmarks.findIndex((b) => b.id === activeBookmarkId);
        let nextIndex: number;
        if (e.key === "j") {
          nextIndex = currentIndex < bookmarks.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }
        onNavigate(bookmarks[nextIndex]?.id || null);
      }
      if (e.key === "t" && activeBookmarkId) {
        onTag();
      }
      if (e.key === "c" && activeBookmarkId) {
        onCollection();
      }
      if (e.key === "n" && activeBookmarkId) {
        onNote();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeBookmarkId, bookmarks, onNavigate, onTag, onCollection, onNote]);
}
