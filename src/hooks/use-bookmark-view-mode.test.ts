// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useBookmarkViewMode } from "@/hooks/use-bookmark-view-mode";

const STORAGE_KEY = "markmaster-bookmark-view-mode";

afterEach(() => {
  localStorage.clear();
});

describe("useBookmarkViewMode", () => {
  it("reads a stored gallery preference", () => {
    localStorage.setItem(STORAGE_KEY, "gallery");
    const { result } = renderHook(() => useBookmarkViewMode());
    expect(result.current.viewMode).toBe("gallery");
  });

  it("keeps the existing feed, compact, and grid values", () => {
    for (const mode of ["feed", "compact", "grid"] as const) {
      localStorage.setItem(STORAGE_KEY, mode);
      const { result, unmount } = renderHook(() => useBookmarkViewMode());
      expect(result.current.viewMode).toBe(mode);
      unmount();
    }
  });

  it("falls back when the stored value is missing or not a view mode", () => {
    const empty = renderHook(() => useBookmarkViewMode("compact"));
    expect(empty.result.current.viewMode).toBe("compact");
    empty.unmount();

    for (const stored of ["mosaic", "tiles", "poster", "Gallery", ""]) {
      localStorage.setItem(STORAGE_KEY, stored);
      const storedHook = renderHook(() => useBookmarkViewMode());
      expect(storedHook.result.current.viewMode).toBe("feed");
      storedHook.unmount();
    }
  });

  it("persists gallery the same way as the other modes", () => {
    const { result } = renderHook(() => useBookmarkViewMode());
    act(() => {
      result.current.setViewMode("gallery");
    });
    expect(result.current.viewMode).toBe("gallery");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("gallery");
  });
});
