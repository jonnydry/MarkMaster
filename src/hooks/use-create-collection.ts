"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendJson } from "@/lib/fetch-json";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateCollection() {
  const queryClient = useQueryClient();

  const createCollection = useCallback(
    async (name: string, description: string, isPublic: boolean) => {
      try {
        await sendJson("/api/collections", {
          method: "POST",
          body: { name, description, isPublic },
        });
        await invalidateCollectionsQuery(queryClient);
        toast.success("Collection created");
      } catch (error) {
        const message = getErrorMessage(error, "Could not create collection");
        toast.error(message);
        throw new Error(message);
      }
    },
    [queryClient]
  );

  const createCollectionQuick = useCallback(
    async (name: string): Promise<string> => {
      try {
        const collection = await sendJson<{ id: string }>("/api/collections", {
          method: "POST",
          body: { name },
        });
        await invalidateCollectionsQuery(queryClient);
        return collection.id;
      } catch (error) {
        const message = getErrorMessage(error, "Could not create collection");
        toast.error(message);
        throw new Error(message);
      }
    },
    [queryClient]
  );

  return useMemo(
    () => ({ createCollection, createCollectionQuick }),
    [createCollection, createCollectionQuick]
  );
}
