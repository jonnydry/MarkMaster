"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import {
  applyOrbitMapSelectionToParams,
  clearOrbitMapSelectionParams,
  parseOrbitMapSelectionFromParams,
} from "@/lib/orbit-map-url-params";
import type { OrbitGraphScope } from "@/types";

export { MAP_SELECTION_KINDS } from "@/lib/orbit-map-url-params";

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

  const selection = useMemo<OrbitMapSelection | null>(
    () =>
      parseOrbitMapSelectionFromParams({
        selectId: selectIdParam,
        selectKind: selectKindParam,
        focusBookmarkId: focusBookmarkIdParam,
      }),
    [focusBookmarkIdParam, selectIdParam, selectKindParam]
  );

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
        applyOrbitMapSelectionToParams(params, next);
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
        clearOrbitMapSelectionParams(params);
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
