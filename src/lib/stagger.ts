const MAX_STAGGER = 5;
const STAGGER_LIMIT = 8;

export function getStaggerClass(
  index: number,
  baseAnimation: "animate-fade-in" | "animate-fade-in-up" | "animate-scale-in" = "animate-fade-in-up"
): string | undefined {
  if (index >= STAGGER_LIMIT) return undefined;
  const step = Math.min(index + 1, MAX_STAGGER);
  return `${baseAnimation} stagger-${step}`;
}
