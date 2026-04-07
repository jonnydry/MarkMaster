"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useCreateCollection() {
  const queryClient = useQueryClient();

  const createCollection = async (
    name: string,
    description: string,
    isPublic: boolean
  ) => {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, isPublic }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data as { error?: string }).error || "Could not create collection";
      toast.error(message);
      throw new Error(message);
    }
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    toast.success("Collection created");
  };

  const createCollectionQuick = async (name: string): Promise<string> => {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const col = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (col as { error?: string }).error || "Could not create collection";
      toast.error(message);
      throw new Error(message);
    }
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    return (col as { id: string }).id;
  };

  return { createCollection, createCollectionQuick };
}
