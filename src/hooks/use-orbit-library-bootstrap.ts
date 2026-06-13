"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { useCreateCollection } from "@/hooks/use-create-collection";
import {
  useCollectionsQuery,
  useLibraryStatsQuery,
  useTagsQuery,
} from "@/hooks/use-library-data";
import type { DbUser } from "@/lib/auth";
import { completeLibrarySync } from "@/lib/library-sync";

type SyncCompleteOptions = {
  refetch?: () => void;
};

export function useOrbitLibraryBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session, update: updateSession } = useSession() as {
    data: { dbUser?: DbUser } | null;
    update: (data?: { refresh: string }) => Promise<unknown>;
  };
  const actions = useBookmarkActions();
  const { createCollection, createCollectionQuick } = useCreateCollection();
  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();
  const { data: libraryStats } = useLibraryStatsQuery();

  const handleSyncComplete = useCallback(
    (options?: SyncCompleteOptions) => {
      completeLibrarySync(queryClient, {
        updateSession: () => updateSession({ refresh: "lastSyncAt" }),
      });
      options?.refetch?.();
    },
    [queryClient, updateSession]
  );

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
  );

  return {
    router,
    searchParams,
    queryClient,
    session,
    dbUser: session?.dbUser,
    actions,
    createCollection,
    createCollectionQuick,
    tags,
    collections,
    libraryStats,
    handleSyncComplete,
    goToTagOnDashboard,
  };
}
