const POSITIONS_STORAGE_PREFIX = "orbit-map-positions-v3";

function storageKey(scope: string) {
  return `${POSITIONS_STORAGE_PREFIX}-${scope}`;
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}

const LEGACY_POSITIONS_STORAGE_KEY = "orbit-map-positions-v3";

export function loadOrbitMapPositions(
  scope = "library"
): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined") return {};
  try {
    let raw = localStorage.getItem(storageKey(scope));
    if (!raw && scope === "library") {
      raw = localStorage.getItem(LEGACY_POSITIONS_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(storageKey(scope), raw);
      }
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isFinitePosition(value)) {
        positions[id] = value;
      }
    }
    return positions;
  } catch {
    return {};
  }
}

export function saveOrbitMapPositions(
  positions: Record<string, { x: number; y: number }>,
  scope = "library"
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(positions));
  } catch {
    // ignore quota errors
  }
}
