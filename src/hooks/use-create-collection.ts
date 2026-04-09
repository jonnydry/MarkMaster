"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sendJson } from "@/lib/fetch-json";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";

export function useCreateCollection() {
  const queryClient = useQueryClient();

  const createCollection = async (
    name: string,
    description: string,
    isPublic: boolean
  ) => {
    try {
      await sendJson("/api/collections", {
        method: "POST",
        body: { name, description, isPublic },
      });
      await invalidateCollectionsQuery(queryClient);
      toast.success("Collection created");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create collection";
      toast.error(message);
      throw new Error(message);
    }
  };

  const createCollectionQuick = async (name: string): Promise<string> => {
    try {
      const collection = await sendJson<{ id: string }>("/api/collections", {
        method: "POST",
        body: { name },
      });
      await invalidateCollectionsQuery(queryClient);
      return collection.id;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create collection";
      toast.error(message);
      throw new Error(message);
    }
  };

  return { createCollection, createCollectionQuick };
}
