const DEFAULT_CALLBACK_URL = "/dashboard";

export function getSafeRelativeCallbackUrl(
  value: string | string[] | undefined,
  fallback = DEFAULT_CALLBACK_URL
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return fallback;

  // Allow same-origin paths only. Protocol-relative URLs and control
  // characters can otherwise turn an OAuth callback into an open redirect.
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  return candidate;
}
