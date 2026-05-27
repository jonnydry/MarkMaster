const STORAGE_KEY = "markmaster-orbit-triage-hint-dismissed";

export function isOrbitTriageHintDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOrbitTriageHint(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore quota errors
  }
}
