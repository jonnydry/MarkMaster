"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import type { CollectionWithCount, TagWithCount } from "@/types";

export function useTagsQuery() {
  return useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: () => fetchJson("/api/tags"),
  });
}

export function useCollectionsQuery() {
  return useQuery<CollectionWithCount[]>({
    queryKey: ["collections"],
    queryFn: () => fetchJson("/api/collections"),
  });
}
