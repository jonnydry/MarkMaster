export interface OrbitMapPerfLogger {
  mark(name: string, detail?: Record<string, number | string>): void;
}

export function createOrbitMapPerfLogger(enabled: boolean): OrbitMapPerfLogger {
  const startTimes = new Map<string, number>();

  return {
    mark(name, detail = {}) {
      if (!enabled) return;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const previous = startTimes.get(name);
      startTimes.set(name, now);
      const elapsed =
        previous === undefined ? undefined : Math.round(now - previous);

      console.info("[OrbitMapPerf]", {
        event: name,
        ...(elapsed !== undefined ? { elapsedMs: elapsed } : {}),
        ...detail,
      });
    },
  };
}
