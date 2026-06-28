import type { QueryClient } from "@tanstack/react-query";

import { invalidateLibraryQueries } from "@/lib/query-invalidation";

type CompleteLibrarySyncOptions = {
  updateSession?: () => void | Promise<unknown>;
  refetchType?: "active" | "all";
};

/** Invalidate library caches (and analytics) after a bookmark sync completes. */
export async function completeLibrarySync(
  queryClient: QueryClient,
  options?: CompleteLibrarySyncOptions
) {
  await invalidateLibraryQueries(queryClient, {
    refetchType: options?.refetchType ?? "active",
  });
  if (options?.updateSession) {
    await options.updateSession();
  }
}
