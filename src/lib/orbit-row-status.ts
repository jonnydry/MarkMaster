import type { OrbitBookmarkDecision, OrbitScanConfidence } from "@/types";

export type OrbitRowQueueStatus = "default" | "hasSuggestion" | "dismissed" | "applied";

export interface OrbitRowSuggestion {
  kind: "tag" | "collection";
  /** Destination tag or collection name. */
  label: string;
  /** Optional tag color for the dot. */
  color?: string;
  confidence: OrbitScanConfidence;
  /** True when the destination already exists in the library (reuse), false for a new one. */
  reuseExisting: boolean;
}

/** Structured primary-suggestion summary for the suggestion-forward row. */
export function getOrbitRowSuggestion(
  decision: OrbitBookmarkDecision | null
): OrbitRowSuggestion | null {
  if (!decision?.primary) return null;
  const { kind, label, color, reuseExisting } = decision.primary;
  return {
    kind,
    label,
    color,
    confidence: decision.confidence,
    reuseExisting,
  };
}

export function getOrbitRowQueueStatus(args: {
  bookmarkId: string;
  dismissedBookmarkIds: Set<string>;
  appliedBookmarkIds: Set<string>;
  decision: OrbitBookmarkDecision | null;
}): OrbitRowQueueStatus {
  if (args.appliedBookmarkIds.has(args.bookmarkId)) return "applied";
  if (args.dismissedBookmarkIds.has(args.bookmarkId)) return "dismissed";
  if (args.decision?.primary) return "hasSuggestion";
  return "default";
}

export function formatOrbitRowStatusChip(
  decision: OrbitBookmarkDecision | null
): string | null {
  if (!decision?.primary) return null;
  const kind = decision.primary.kind === "collection" ? "Collection" : "Tag";
  const conf =
    decision.confidence === "high"
      ? "high"
      : decision.confidence === "medium"
        ? "med"
        : "low";
  return `${kind} · ${conf}`;
}
