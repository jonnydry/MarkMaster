import type { SyncRunSummary } from "@/types";

export const TERMINAL_SYNC_STATUSES = new Set([
  "COMPLETED",
  "RATE_LIMITED",
  "FAILED",
]);

export function isTerminalSyncStatus(status: SyncRunSummary["status"]): boolean {
  return TERMINAL_SYNC_STATUSES.has(status);
}

/** Match a pending run id against finished rows in recentRuns. */
export function findTerminalRunForId(
  recentRuns: SyncRunSummary[],
  runId: string
): SyncRunSummary | undefined {
  return recentRuns.find(
    (run) => run.id === runId && isTerminalSyncStatus(run.status)
  );
}

/**
 * Guard for the currentRun → null fallback path: only treat recentRuns[0] as
 * our initiated sync when it matches the pending or previously active run.
 */
export function isExpectedFinishedRun(
  finishedRun: SyncRunSummary,
  options: {
    pendingRunId?: string | null;
    previousRunId?: string;
  }
): boolean {
  if (!isTerminalSyncStatus(finishedRun.status)) {
    return false;
  }

  if (options.pendingRunId) {
    if (finishedRun.id !== options.pendingRunId) {
      return false;
    }
    if (
      options.previousRunId &&
      options.previousRunId !== options.pendingRunId
    ) {
      return false;
    }
    return true;
  }

  return (
    Boolean(options.previousRunId) &&
    finishedRun.id === options.previousRunId
  );
}
