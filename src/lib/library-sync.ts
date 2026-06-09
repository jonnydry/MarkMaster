import type { QueryClient } from "@tanstack/react-query";

import { invalidateLibraryQueries } from "@/lib/query-invalidation";

type CompleteLibrarySyncOptions = {
  updateSession?: () => void | Promise<unknown>;
  refetchType?: "active" | "all";
};

/** Invalidate library caches (and analytics) after a bookmark sync completes. */
export function completeLibrarySync(
  queryClient: QueryClient,
  options?: CompleteLibrarySyncOptions
) {
  void invalidateLibraryQueries(queryClient, {
    refetchType: options?.refetchType ?? "all",
  });
  if (options?.updateSession) {
    void options.updateSession();
  }
}
