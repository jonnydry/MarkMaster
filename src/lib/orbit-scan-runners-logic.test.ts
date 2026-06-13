import { describe, expect, it } from "vitest";

import {
  canRescanCurrentSelection,
  isStaleScanPlan,
} from "@/lib/orbit-scan-runners-logic";

describe("isStaleScanPlan", () => {
  it("is false when there is no plan", () => {
    expect(
      isStaleScanPlan({
        hasPlan: false,
        scanContextAtLastRun: "ctx-a",
        currentScanContextKey: "ctx-b",
      })
    ).toBe(false);
  });

  it("is true when context keys differ", () => {
    expect(
      isStaleScanPlan({
        hasPlan: true,
        scanContextAtLastRun: "ctx-a",
        currentScanContextKey: "ctx-b",
      })
    ).toBe(true);
  });

  it("is false when context keys match", () => {
    expect(
      isStaleScanPlan({
        hasPlan: true,
        scanContextAtLastRun: "ctx-a",
        currentScanContextKey: "ctx-a",
      })
    ).toBe(false);
  });
});

describe("canRescanCurrentSelection", () => {
  it("requires a scan error and selected targets", () => {
    expect(
      canRescanCurrentSelection({
        hasScanError: false,
        selectedScanTargetIds: ["b1"],
        lastScanRequest: null,
      })
    ).toBe(false);
  });

  it("blocks rescan when last request already scanned the same selection", () => {
    expect(
      canRescanCurrentSelection({
        hasScanError: true,
        selectedScanTargetIds: ["b1", "b2"],
        lastScanRequest: {
          targetIds: ["b1", "b2"],
          scanningSelection: true,
          contextKey: "ctx",
          batch: undefined,
        },
      })
    ).toBe(false);
  });

  it("allows rescan when selection differs from the failed selection scan", () => {
    expect(
      canRescanCurrentSelection({
        hasScanError: true,
        selectedScanTargetIds: ["b3"],
        lastScanRequest: {
          targetIds: ["b1", "b2"],
          scanningSelection: true,
          contextKey: "ctx",
          batch: undefined,
        },
      })
    ).toBe(true);
  });
});
