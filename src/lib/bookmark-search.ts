const MAX_SEARCH_TERMS = 8;

export function tokenizeBookmarkSearch(input: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const rawTerm of input.trim().split(/\s+/)) {
    const term = rawTerm.replace(/^[@#]+/, "").trim();
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    terms.push(term);

    if (terms.length >= MAX_SEARCH_TERMS) break;
  }

  return terms;
}
