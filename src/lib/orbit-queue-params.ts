import type { OrbitSortDirection, OrbitView } from "@/lib/orbit-navigation";

export type OrbitQueueFilterInput = {
  orbitView: OrbitView;
  page: number;
  pageSize: number;
  sortDirection: OrbitSortDirection;
  search: string;
  pageCursors?: Record<number, string>;
};

/** Query string for the unaffiliated bookmark queue list. */
export function buildOrbitQueueListQueryString(input: OrbitQueueFilterInput): string {
  const params = new URLSearchParams({
    page: input.orbitView === "recent" ? "1" : input.page.toString(),
    limit: input.pageSize.toString(),
    sortField: "bookmarkedAt",
    sortDirection: input.sortDirection,
    unaffiliated: "true",
  });

  if (input.search) {
    params.set("search", input.search);
  }

  const cursor =
    input.orbitView === "all" && input.page > 1
      ? input.pageCursors?.[input.page]
      : undefined;
  if (cursor) {
    params.set("cursor", cursor);
  }

  return params.toString();
}

/** Query string for Grok scan-candidate pool (shares filters with the queue). */
export function buildOrbitScanCandidatesQueryString(
  input: Omit<OrbitQueueFilterInput, "pageCursors"> & { candidateLimit: number }
): string {
  const params = new URLSearchParams({
    page: input.orbitView === "recent" ? "1" : input.page.toString(),
    pageSize: input.pageSize.toString(),
    limit: input.candidateLimit.toString(),
    sortDirection: input.sortDirection,
  });

  if (input.search) {
    params.set("search", input.search);
  }

  return params.toString();
}

export function resetOrbitPaginationActions() {
  return { page: 1, pageCursors: {} as Record<number, string> };
}
