"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphScope } from "@/types";

export const MAP_SELECTION_KINDS: ReadonlySet<OrbitMapSelection["kind"]> =
  new Set(["tag", "collection", "bookmark", "core", "overflow"]);

function clearSelectionParams(params: URLSearchParams) {
  params.delete("select");
  params.delete("kind");
  params.delete("bookmark");
  params.delete("focus");
  params.delete("anchor");
}

export function useOrbitMapUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const focusBookmarkIdParam = searchParams?.get("focus") ?? null;
  const focusAnchorIdParam = searchParams?.get("anchor") ?? null;
  const assignmentBookmarkIdParam = searchParams?.get("bookmark") ?? null;
  const scopeParam = searchParams?.get("scope");
  const selectIdParam = searchParams?.get("select") ?? null;
  const selectKindParam = searchParams?.get("kind") ?? null;

  const graphScope: OrbitGraphScope =
    scopeParam === "orbit" ? "orbit" : "library";

  const selection = useMemo<OrbitMapSelection | null>(() => {
    if (
      selectIdParam &&
      selectKindParam &&
      MAP_SELECTION_KINDS.has(selectKindParam as OrbitMapSelection["kind"])
    ) {
      return {
        kind: selectKindParam as OrbitMapSelection["kind"],
        id: selectIdParam,
      };
    }
    if (focusBookmarkIdParam) {
      return { kind: "bookmark", id: focusBookmarkIdParam };
    }
    return null;
  }, [focusBookmarkIdParam, selectIdParam, selectKindParam]);

  const replaceMapUrl = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutate(params);
      const query = params.toString();
      router.replace(query ? `/orbit/map?${query}` : "/orbit/map", {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  const handleSelectionChange = useCallback(
    (next: OrbitMapSelection | null) => {
      replaceMapUrl((params) => {
        if (next) {
          params.set("select", next.id);
          params.set("kind", next.kind);
          if (next.kind === "bookmark") {
            params.set("bookmark", next.id);
          }
        } else {
          clearSelectionParams(params);
        }
      });
    },
    [replaceMapUrl]
  );

  const handleScopeChange = useCallback(
    (next: OrbitGraphScope, beforeNavigate?: () => void) => {
      beforeNavigate?.();
      replaceMapUrl((params) => {
        if (next === "orbit") {
          params.set("scope", "orbit");
        } else {
          params.delete("scope");
        }
        clearSelectionParams(params);
      });
    },
    [replaceMapUrl]
  );

  return {
    focusBookmarkIdParam,
    focusAnchorIdParam,
    assignmentBookmarkIdParam,
    graphScope,
    selection,
    handleSelectionChange,
    handleScopeChange,
  };
}
