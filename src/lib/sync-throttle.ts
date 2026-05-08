import type { SyncRunStatus } from "@/types";

export const SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;

export interface SyncThrottleRun {
  status: SyncRunStatus;
  startedAt: Date;
  completedAt: Date | null;
  rateLimitResetsAt: Date | null;
}

export function getSyncRetryUntil(
  run: SyncThrottleRun,
  now: Date = new Date()
): Date | null {
  const finishedAt = run.completedAt ?? run.startedAt;
  const cooldownUntil = new Date(finishedAt.getTime() + SYNC_MIN_INTERVAL_MS);
  const retryCandidates = [cooldownUntil];

  if (
    run.status === "RATE_LIMITED" &&
    run.rateLimitResetsAt &&
    run.rateLimitResetsAt.getTime() > now.getTime()
  ) {
    retryCandidates.push(run.rateLimitResetsAt);
  }

  const retryUntil = retryCandidates.reduce((latest, candidate) =>
    candidate.getTime() > latest.getTime() ? candidate : latest
  );

  return retryUntil.getTime() > now.getTime() ? retryUntil : null;
}

export function getRetryAfterSeconds(retryUntil: Date, now: Date = new Date()) {
  return Math.max(
    1,
    Math.ceil((retryUntil.getTime() - now.getTime()) / 1000)
  );
}
