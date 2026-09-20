type NamedTag = {
  id: string;
  name: string;
  _count?: { bookmarks?: number };
};

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Groups of tags that differ only by case or spacing. */
export function findCaseDuplicateTagGroups<T extends NamedTag>(
  tags: T[]
): T[][] {
  const groups = new Map<string, T[]>();
  for (const tag of tags) {
    const key = normalizeKey(tag.name);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(tag);
    else groups.set(key, [tag]);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

/** Keep the busiest tag; prefer mixed case over ALL CAPS when counts tie. */
export function pickCanonicalTag<T extends NamedTag>(tags: T[]): T {
  if (tags.length === 0) {
    throw new Error("pickCanonicalTag requires at least one tag");
  }

  return [...tags].sort((a, b) => {
    const countDiff =
      (b._count?.bookmarks ?? 0) - (a._count?.bookmarks ?? 0);
    if (countDiff) return countDiff;

    const aAllCaps = a.name === a.name.toUpperCase() ? 1 : 0;
    const bAllCaps = b.name === b.name.toUpperCase() ? 1 : 0;
    if (aAllCaps !== bAllCaps) return aAllCaps - bAllCaps;

    return a.name.localeCompare(b.name);
  })[0]!;
}
