import type { OrbitGraphNode } from "@/types";

export const ORBIT_MAP_SEARCH_RESULT_LIMIT = 8;
export const ORBIT_MAP_SEARCH_HIGHLIGHT_LIMIT = 400;

export type OrbitMapSearchIndexEntry = {
  index: number;
  node: OrbitGraphNode;
  text: string;
};

function getSearchText(node: OrbitGraphNode) {
  switch (node.kind) {
    case "tag":
    case "collection":
      return node.name.toLowerCase();
    case "bookmark":
      return `${node.authorUsername} ${node.title}`.toLowerCase();
    default:
      return "";
  }
}

function getKindRank(node: OrbitGraphNode) {
  if (node.kind === "tag") return 0;
  if (node.kind === "collection") return 1;
  if (node.kind === "bookmark") return 2;
  return 3;
}

function getMatchRank(node: OrbitGraphNode, text: string, query: string) {
  const exactBonus = text === query ? -20 : 0;
  const startBonus = text.startsWith(query) ? -10 : 0;
  return getKindRank(node) + exactBonus + startBonus;
}

/** Precompute searchable text once per graph load (worker + tests). */
export function buildOrbitMapSearchIndex(
  nodes: OrbitGraphNode[]
): OrbitMapSearchIndexEntry[] {
  const entries: OrbitMapSearchIndexEntry[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const text = getSearchText(node);
    if (!text) continue;
    entries.push({ index, node, text });
  }

  return entries;
}

export function searchOrbitMapIndex(
  entries: OrbitMapSearchIndexEntry[],
  rawQuery: string,
  options?: {
    resultLimit?: number;
    highlightLimit?: number;
  }
) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return { results: [] as OrbitGraphNode[], highlightNodeIds: [] as string[] };
  }

  const resultLimit =
    options?.resultLimit ?? ORBIT_MAP_SEARCH_RESULT_LIMIT;
  const highlightLimit =
    options?.highlightLimit ?? ORBIT_MAP_SEARCH_HIGHLIGHT_LIMIT;

  const matches: Array<{
    node: OrbitGraphNode;
    rank: number;
    index: number;
  }> = [];

  for (const entry of entries) {
    if (!entry.text.includes(query)) continue;
    matches.push({
      node: entry.node,
      rank: getMatchRank(entry.node, entry.text, query),
      index: entry.index,
    });
  }

  matches.sort((a, b) => a.rank - b.rank || a.index - b.index);

  return {
    results: matches.slice(0, resultLimit).map((match) => match.node),
    highlightNodeIds: matches
      .slice(0, highlightLimit)
      .map((match) => match.node.id),
  };
}

export function rankOrbitMapSearchResults(
  nodes: OrbitGraphNode[],
  rawQuery: string
) {
  const index = buildOrbitMapSearchIndex(nodes);
  return searchOrbitMapIndex(index, rawQuery, {
    resultLimit: Number.POSITIVE_INFINITY,
    highlightLimit: Number.POSITIVE_INFINITY,
  }).results;
}
