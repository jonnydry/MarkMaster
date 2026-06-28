import { describe, expect, it } from "vitest";

import {
  findTerminalRunForId,
  isExpectedFinishedRun,
  isTerminalSyncStatus,
} from "./sync-client-completion";
import type { SyncRunSummary } from "@/types";

function run(
  overrides: Partial<SyncRunSummary> & Pick<SyncRunSummary, "id" | "status">
): SyncRunSummary {
  return {
    newBookmarks: 0,
    updatedBookmarks: 0,
    totalFetched: 0,
    hitExisting: false,
    rateLimited: false,
    rateLimitResetsAt: null,
    errorMessage: null,
    pagesFetched: 0,
    resumeToken: null,
    continuationToken: null,
    includeFolders: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

describe("sync-client-completion", () => {
  it("recognizes terminal sync statuses", () => {
    expect(isTerminalSyncStatus("COMPLETED")).toBe(true);
    expect(isTerminalSyncStatus("RATE_LIMITED")).toBe(true);
    expect(isTerminalSyncStatus("FAILED")).toBe(true);
    expect(isTerminalSyncStatus("RUNNING")).toBe(false);
    expect(isTerminalSyncStatus("PENDING")).toBe(false);
  });

  it("finds a finished run by id in recentRuns", () => {
    const recentRuns = [
      run({ id: "run-2", status: "COMPLETED", newBookmarks: 3 }),
      run({ id: "run-1", status: "FAILED" }),
    ];

    expect(findTerminalRunForId(recentRuns, "run-2")?.newBookmarks).toBe(3);
    expect(findTerminalRunForId(recentRuns, "run-1")?.status).toBe("FAILED");
    expect(findTerminalRunForId(recentRuns, "missing")).toBeUndefined();
    expect(
      findTerminalRunForId(
        [run({ id: "run-2", status: "RUNNING" })],
        "run-2"
      )
    ).toBeUndefined();
  });

  it("accepts fallback completion only for the initiated or active run", () => {
    const finished = run({ id: "run-a", status: "COMPLETED" });
    const other = run({ id: "run-b", status: "COMPLETED" });

    expect(
      isExpectedFinishedRun(finished, {
        pendingRunId: "run-a",
        previousRunId: "run-a",
      })
    ).toBe(true);
    expect(
      isExpectedFinishedRun(other, {
        pendingRunId: "run-a",
        previousRunId: "run-a",
      })
    ).toBe(false);
    expect(
      isExpectedFinishedRun(finished, {
        pendingRunId: "run-a",
        previousRunId: "run-b",
      })
    ).toBe(false);
    expect(
      isExpectedFinishedRun(finished, {
        previousRunId: "run-a",
      })
    ).toBe(true);
    expect(
      isExpectedFinishedRun(other, {
        previousRunId: "run-a",
      })
    ).toBe(false);
  });
});
