"use client";

import { useEffect, useRef } from "react";

interface UseKeyboardShortcutsOptions {
  activeBookmarkId: string | null;
  bookmarks: { id: string }[];
  onNavigate: (id: string | null) => void;
  onSearch?: () => void;
  onTag: () => void;
  onCollection: () => void;
  onNote: () => void;
}

function isEditable(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts({
  activeBookmarkId,
  bookmarks,
  onNavigate,
  onSearch,
  onTag,
  onCollection,
  onNote,
}: UseKeyboardShortcutsOptions) {
  const refs = useRef({ activeBookmarkId, bookmarks, onNavigate, onSearch, onTag, onCollection, onNote });
  useEffect(() => {
    refs.current = { activeBookmarkId, bookmarks, onNavigate, onSearch, onTag, onCollection, onNote };
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditable(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const { activeBookmarkId: abid, bookmarks: bks, onNavigate: nav, onSearch: search, onTag: tag, onCollection: col, onNote: note } = refs.current;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const currentIndex = bks.findIndex((b) => b.id === abid);
        let nextIndex: number;
        if (e.key === "j") {
          nextIndex = currentIndex < bks.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }
        nav(bks[nextIndex]?.id || null);
      }
      if (e.key === "/") {
        e.preventDefault();
        search?.();
      }
      if (e.key === "t" && abid) {
        tag();
      }
      if (e.key === "c" && abid) {
        col();
      }
      if (e.key === "n" && abid) {
        note();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}