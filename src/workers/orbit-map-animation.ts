export interface OrbitMapAnimationTiming {
  startTime: number;
  duration: number;
}

export function getOrbitMapAnimationProgress(
  timing: OrbitMapAnimationTiming,
  now = Date.now()
) {
  return Math.min((now - timing.startTime) / timing.duration, 1);
}

export function easeOrbitMapOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function shouldContinueOrbitMapLoop(
  alpha: number,
  activeAnimationCount: number
) {
  return alpha > 0.008 || activeAnimationCount > 0;
}
