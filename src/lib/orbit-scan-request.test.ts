import { describe, expect, it } from "vitest";

import { buildOrbitScanRequest } from "@/lib/orbit-scan-request";

describe("buildOrbitScanRequest", () => {
  it("builds a queue scan request with fallback batch metadata", () => {
    const request = buildOrbitScanRequest({
      targetIds: ["a", "b"],
      scanSelection: false,
      orbitView: "all",
      page: 2,
      queryString: "page=2&limit=24",
      resolvedScanBatchMode: "auto",
    });

    expect(request.targetIds).toEqual(["a", "b"]);
    expect(request.scanningSelection).toBe(false);
    expect(request.batch.mode).toBe("auto");
    expect(request.batch.requestedCount).toBe(2);
    expect(request.contextKey).toContain("all");
    expect(request.contextKey).toContain("queue");
  });

  it("uses explicit batch metadata and selection context keys", () => {
    const request = buildOrbitScanRequest({
      targetIds: ["x"],
      scanSelection: true,
      orbitView: "recent",
      page: 1,
      queryString: "page=1&limit=12",
      resolvedScanBatchMode: "balanced",
      batchMetadata: {
        mode: "balanced",
        profile: "balanced",
        requestedCount: 1,
        candidatePoolCount: 10,
        sharedSignalCount: 2,
        sourceUnknownCount: 0,
        sourceUnknownRate: 0,
        selectedSourceUnknownCount: 0,
        selectedSourceUnknownRate: 0,
        usefulSignalCount: 3,
        selectionReason: "Selected for scan.",
      },
    });

    expect(request.scanningSelection).toBe(true);
    expect(request.batch.profile).toBe("balanced");
    expect(request.contextKey).toContain("sel:x");
  });
});
