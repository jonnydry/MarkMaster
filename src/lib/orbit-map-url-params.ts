import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { GraphFilter } from "@/lib/orbit-worker-protocol";

export const MAP_SELECTION_KINDS: ReadonlySet<OrbitMapSelection["kind"]> =
  new Set(["tag", "collection", "bookmark", "core", "overflow"]);

export function clearOrbitMapSelectionParams(params: URLSearchParams) {
  params.delete("select");
  params.delete("kind");
  params.delete("bookmark");
  params.delete("focus");
  params.delete("anchor");
}

export function parseOrbitMapSelectionFromParams(args: {
  selectId: string | null;
  selectKind: string | null;
  focusBookmarkId: string | null;
}): OrbitMapSelection | null {
  if (
    args.selectId &&
    args.selectKind &&
    MAP_SELECTION_KINDS.has(args.selectKind as OrbitMapSelection["kind"])
  ) {
    return {
      kind: args.selectKind as OrbitMapSelection["kind"],
      id: args.selectId,
    };
  }
  if (args.focusBookmarkId) {
    return { kind: "bookmark", id: args.focusBookmarkId };
  }
  return null;
}

export function parseOrbitMapFilterFromParams(
  value: string | null | undefined
): GraphFilter {
  return value === "loose" || value === "recent" ? value : "all";
}

export function applyOrbitMapFilterToParams(
  params: URLSearchParams,
  filter: GraphFilter
) {
  if (filter === "all") {
    params.delete("filter");
    return;
  }
  params.set("filter", filter);
}

export function applyOrbitMapSelectionToParams(
  params: URLSearchParams,
  next: OrbitMapSelection | null
) {
  if (next) {
    params.set("select", next.id);
    params.set("kind", next.kind);
    if (next.kind === "bookmark") {
      params.set("bookmark", next.id);
    }
  } else {
    clearOrbitMapSelectionParams(params);
  }
}
