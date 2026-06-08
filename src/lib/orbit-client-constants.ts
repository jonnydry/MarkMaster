import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
import type { BookmarkWithRelations } from "@/types";

export type OrbitReviewSession = {
  open: boolean;
  focusBookmarkId: string | null;
  digestBookmarkIds: string[] | null;
  source: string | null;
  sessionId: number;
};

export const EMPTY_BOOKMARKS: BookmarkWithRelations[] = [];

export const EMPTY_REVIEW_SESSION: OrbitReviewSession = {
  open: false,
  focusBookmarkId: null,
  digestBookmarkIds: null,
  source: null,
  sessionId: 0,
};

export const ORBIT_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Queue Navigation",
    shortcuts: [
      { id: "next", keys: ["J", "ArrowDown"], label: "Next queue item" },
      { id: "previous", keys: ["K", "ArrowUp"], label: "Previous queue item" },
      { id: "search", keys: ["/"], label: "Search Orbit" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Triage Active Item",
    shortcuts: [
      { id: "accept", keys: ["A"], label: "Accept Grok suggestion" },
      { id: "skip", keys: ["S"], label: "Skip / keep in Orbit" },
      { id: "edit", keys: ["E"], label: "Edit in review" },
    ],
  },
  {
    title: "Orbit Actions",
    shortcuts: [
      { id: "scan", keys: ["G"], label: "Run Grok scan" },
      { id: "review", keys: ["V"], label: "Open Review pass" },
      { id: "tag", keys: ["T"], label: "Add tag to selected item" },
      { id: "collection", keys: ["C"], label: "Add selected item to collection" },
    ],
  },
];
