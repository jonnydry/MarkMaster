import { trackFlywheelEvent } from "./flywheel";

const STORAGE_KEY = "markmaster:disliked-highlights";
const LIKED_STORAGE_KEY = "markmaster:liked-highlights";

export function getDislikedHighlightIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addDislikedHighlightId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getDislikedHighlightIds();
    if (!current.includes(id)) {
      const updated = [...current, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // ensure not also liked (symmetric to addLiked)
      const likCurrent = getLikedHighlightIds().filter((x) => x !== id);
      localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(likCurrent));
      window.dispatchEvent(new CustomEvent("markmaster:highlight-feedback-changed"));
      // Phase 3 Item 12: record feedback usage for flywheel measurement (lightweight)
      trackFlywheelEvent("feedback.not_relevant");
    }
  } catch {
    // quota / private mode / etc. — graceful no-op
  }
}

export function removeDislikedHighlightId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getDislikedHighlightIds();
    const updated = current.filter((x) => x !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("markmaster:highlight-feedback-changed"));
  } catch {
    // quota / private mode / etc. — graceful no-op
  }
}

export function getLikedHighlightIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LIKED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addLikedHighlightId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getLikedHighlightIds();
    if (!current.includes(id)) {
      const updated = [...current, id];
      localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(updated));
      // ensure not also disliked (symmetric)
      const disCurrent = getDislikedHighlightIds().filter((x) => x !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(disCurrent));
      window.dispatchEvent(new CustomEvent("markmaster:highlight-feedback-changed"));
      // Phase 3 Item 12: record feedback usage for flywheel measurement (lightweight)
      trackFlywheelEvent("feedback.good");
    }
  } catch {
    // quota / private mode / etc. — graceful no-op
  }
}

export function removeLikedHighlightId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getLikedHighlightIds();
    const updated = current.filter((x) => x !== id);
    localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("markmaster:highlight-feedback-changed"));
  } catch {
    // quota / private mode / etc. — graceful no-op
  }
}

export function getHighlightFeedback(id: string): "good" | "not_relevant" | null {
  if (typeof window === "undefined") return null;
  if (getLikedHighlightIds().includes(id)) return "good";
  if (getDislikedHighlightIds().includes(id)) return "not_relevant";
  return null;
}

