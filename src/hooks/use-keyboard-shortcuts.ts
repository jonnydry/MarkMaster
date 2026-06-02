"use client";

import { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  id: string;
  keys: readonly string[];
  label: string;
  disabled?: boolean;
}

export interface KeyboardShortcutGroup {
  title: string;
  shortcuts: readonly KeyboardShortcut[];
}

interface UseSurfaceKeyboardShortcutsOptions {
  shortcutGroups: readonly KeyboardShortcutGroup[];
  actions: Partial<Record<string, (event: KeyboardEvent) => void>>;
  disabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  activeBookmarkId: string | null;
  bookmarks: { id: string }[];
  onNavigate: (id: string | null) => void;
  onOpen?: (id: string) => void;
  onSearch?: () => void;
  onTag: () => void;
  onCollection: () => void;
  onNote: () => void;
  onShowShortcuts?: () => void;
}

export const DASHBOARD_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { id: "next", keys: ["J"], label: "Next post" },
      { id: "previous", keys: ["K"], label: "Previous post" },
      { id: "open", keys: ["O"], label: "Open expanded view" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { id: "search", keys: ["/"], label: "Search" },
      { id: "tag", keys: ["T"], label: "Tags" },
      { id: "collection", keys: ["C"], label: "Collection" },
      { id: "note", keys: ["N"], label: "Note" },
    ],
  },
];

function isEditable(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
    ) || target.isContentEditable
  );
}

function hasBlockingLayer(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="menu"], [data-slot="dialog-content"], [data-slot="popover-content"]'
    )
  ).some((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const intersectsViewport =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight;

    return (
      intersectsViewport &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none"
    );
  });
}

function escapeSelectorValue(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

export function scrollDataElementIntoView(attribute: string, value: string) {
  const escapedValue = escapeSelectorValue(value);
  const target = document.querySelector<HTMLElement>(
    `[${attribute}="${escapedValue}"]`
  );

  target?.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
}

export function focusElement(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return false;
  target.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
  target.focus();
  return true;
}

function normalizeShortcutKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

function shortcutMatchesEvent(shortcut: KeyboardShortcut, event: KeyboardEvent) {
  const eventKey =
    (event.key === "/" || event.code === "Slash") && event.shiftKey
      ? "?"
      : normalizeShortcutKey(event.key);
  return shortcut.keys.some((key) => normalizeShortcutKey(key) === eventKey);
}

export function formatShortcutKey(key: string) {
  switch (key) {
    case "ArrowDown":
      return "↓";
    case "ArrowUp":
      return "↑";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "Escape":
      return "Esc";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

export function useSurfaceKeyboardShortcuts({
  shortcutGroups,
  actions,
  disabled = false,
}: UseSurfaceKeyboardShortcutsOptions) {
  const refs = useRef({ shortcutGroups, actions, disabled });

  useEffect(() => {
    refs.current = { shortcutGroups, actions, disabled };
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditable(event)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const {
        shortcutGroups: currentGroups,
        actions: currentActions,
        disabled: shortcutsDisabled,
      } = refs.current;
      if (shortcutsDisabled) return;
      if (hasBlockingLayer()) return;

      for (const group of currentGroups) {
        for (const shortcut of group.shortcuts) {
          if (shortcut.disabled || !shortcutMatchesEvent(shortcut, event)) {
            continue;
          }

          const action = currentActions[shortcut.id];
          if (!action) return;
          event.preventDefault();
          action(event);
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

export function useKeyboardShortcuts({
  activeBookmarkId,
  bookmarks,
  onNavigate,
  onOpen,
  onSearch,
  onTag,
  onCollection,
  onNote,
  onShowShortcuts,
}: UseKeyboardShortcutsOptions) {
  const refs = useRef({
    activeBookmarkId,
    bookmarks,
    onNavigate,
    onOpen,
    onSearch,
    onTag,
    onCollection,
    onNote,
    onShowShortcuts,
  });

  useEffect(() => {
    refs.current = {
      activeBookmarkId,
      bookmarks,
      onNavigate,
      onOpen,
      onSearch,
      onTag,
      onCollection,
      onNote,
      onShowShortcuts,
    };
  });

  useSurfaceKeyboardShortcuts({
    shortcutGroups: DASHBOARD_SHORTCUT_GROUPS,
    actions: {
      next: () => {
        const {
          activeBookmarkId: currentId,
          bookmarks: currentBookmarks,
          onNavigate: navigate,
        } = refs.current;
        if (currentBookmarks.length === 0) return;
        const currentIndex = currentBookmarks.findIndex(
          (bookmark) => bookmark.id === currentId
        );
        const nextIndex =
          currentIndex === -1
            ? 0
            : Math.min(currentBookmarks.length - 1, currentIndex + 1);
        const nextId = currentBookmarks[nextIndex]?.id ?? null;
        navigate(nextId);
        if (nextId) {
          requestAnimationFrame(() =>
            scrollDataElementIntoView("data-dashboard-bookmark-id", nextId)
          );
        }
      },
      previous: () => {
        const {
          activeBookmarkId: currentId,
          bookmarks: currentBookmarks,
          onNavigate: navigate,
        } = refs.current;
        if (currentBookmarks.length === 0) return;
        const currentIndex = currentBookmarks.findIndex(
          (bookmark) => bookmark.id === currentId
        );
        const nextIndex =
          currentIndex === -1 ? 0 : Math.max(0, currentIndex - 1);
        const nextId = currentBookmarks[nextIndex]?.id ?? null;
        navigate(nextId);
        if (nextId) {
          requestAnimationFrame(() =>
            scrollDataElementIntoView("data-dashboard-bookmark-id", nextId)
          );
        }
      },
      open: () => {
        const {
          activeBookmarkId: currentId,
          bookmarks: currentBookmarks,
          onNavigate: navigate,
          onOpen: open,
        } = refs.current;
        const targetId = currentId ?? currentBookmarks[0]?.id ?? null;
        if (!targetId) return;
        navigate(targetId);
        open?.(targetId);
        requestAnimationFrame(() =>
          scrollDataElementIntoView("data-dashboard-bookmark-id", targetId)
        );
      },
      shortcuts: () => refs.current.onShowShortcuts?.(),
      search: () => refs.current.onSearch?.(),
      tag: () => {
        if (refs.current.activeBookmarkId) refs.current.onTag();
      },
      collection: () => {
        if (refs.current.activeBookmarkId) refs.current.onCollection();
      },
      note: () => {
        if (refs.current.activeBookmarkId) refs.current.onNote();
      },
    },
  });
}
