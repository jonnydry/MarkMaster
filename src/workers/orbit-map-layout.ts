export function getSeededOrbitMapPosition(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const x = ((hash >>> 0) % 100000) / 100000;
  const y = (((hash >>> 16) ^ (hash >>> 0)) % 100000) / 100000;

  return {
    x: (x - 0.5) * 900,
    y: (y - 0.5) * 700,
  };
}

export function isFiniteOrbitMapPosition(
  value: unknown
): value is { x: number; y: number } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}
