import type { OrbitGraphNode } from "@/types";

export const ORBIT_MAP_SEARCH_RESULT_LIMIT = 8;

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

export function rankOrbitMapSearchResults(
  nodes: OrbitGraphNode[],
  rawQuery: string
) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const matches: Array<{ index: number; node: OrbitGraphNode; rank: number }> = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const text = getSearchText(node);
    if (!text.includes(query)) continue;
    matches.push({ index, node, rank: getMatchRank(node, text, query) });
  }

  return matches
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((match) => match.node);
}
