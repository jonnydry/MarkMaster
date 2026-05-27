import type { OrbitBookmarkDecision } from "@/types";

export type OrbitRowQueueStatus = "default" | "hasSuggestion" | "dismissed" | "applied";

export function getOrbitRowQueueStatus(args: {
  bookmarkId: string;
  dismissedBookmarkIds: Set<string>;
  appliedBookmarkIds: Set<string>;
  decision: OrbitBookmarkDecision | null;
}): OrbitRowQueueStatus {
  if (args.dismissedBookmarkIds.has(args.bookmarkId)) return "dismissed";
  if (args.appliedBookmarkIds.has(args.bookmarkId)) return "applied";
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
