import "server-only";

const DOMAIN_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /(^|\.)arxiv\.org$/i, hint: "Paper" },
  { pattern: /(^|\.)github\.com$/i, hint: "Code" },
  { pattern: /(^|\.)gitlab\.com$/i, hint: "Code" },
  { pattern: /(^|\.)youtube\.com$/i, hint: "Video" },
  { pattern: /(^|\.)youtu\.be$/i, hint: "Video" },
  { pattern: /(^|\.)vimeo\.com$/i, hint: "Video" },
  { pattern: /(^|\.)medium\.com$/i, hint: "Article" },
  { pattern: /(^|\.)substack\.com$/i, hint: "Article" },
  { pattern: /(^|\.)wikipedia\.org$/i, hint: "Reference" },
  { pattern: /(^|\.)npmjs\.com$/i, hint: "Package" },
  { pattern: /(^|\.)pypi\.org$/i, hint: "Package" },
  { pattern: /(^|\.)huggingface\.co$/i, hint: "Model" },
  { pattern: /(^|\.)docs\.google\.com$/i, hint: "Document" },
  { pattern: /(^|\.)notion\.so$/i, hint: "Document" },
];

export function getDomainHints(domains: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const hints: string[] = [];

  for (const domain of domains) {
    if (!domain) continue;
    const normalized = domain.trim().toLowerCase();
    if (!normalized) continue;

    for (const entry of DOMAIN_HINTS) {
      if (!entry.pattern.test(normalized)) continue;
      if (seen.has(entry.hint)) continue;
      seen.add(entry.hint);
      hints.push(entry.hint);
    }
  }

  return hints;
}