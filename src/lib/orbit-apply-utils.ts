import type { OrbitApplyResult, OrbitDecisionEventPayload } from "@/types";

export function formatAppliedToast(applied: OrbitApplyResult): string {
  const parts: string[] = [];
  if (applied.tagAssignments > 0) {
    parts.push(
      `${applied.tagAssignments} tag assignment${
        applied.tagAssignments === 1 ? "" : "s"
      }`
    );
  }
  if (applied.collectionAssignments > 0) {
    parts.push(
      `${applied.collectionAssignments} collection placement${
        applied.collectionAssignments === 1 ? "" : "s"
      }`
    );
  }
  if (applied.createdCollections > 0) {
    parts.push(
      `${applied.createdCollections} new collection${
        applied.createdCollections === 1 ? "" : "s"
      }`
    );
  }
  if (parts.length === 0) parts.push("no changes needed");
  return parts.join(" • ");
}

export function buildNoOpApplyResult(bookmarkCount: number): OrbitApplyResult {
  return {
    bookmarkCount,
    createdTags: 0,
    reusedTags: 0,
    tagAssignments: 0,
    createdCollections: 0,
    reusedCollections: 0,
    collectionAssignments: 0,
    skippedNewCollectionSingletons: 0,
  };
}

export function countDecisionActions(events: OrbitDecisionEventPayload[]) {
  return events.reduce(
    (counts, event) => {
      counts[event.action] += 1;
      return counts;
    },
    { accepted: 0, edited: 0, kept: 0, rejected: 0 }
  );
}
