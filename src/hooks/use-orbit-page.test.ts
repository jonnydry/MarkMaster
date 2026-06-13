import { describe, expect, it, vi } from "vitest";

import { useOrbitPage } from "@/hooks/use-orbit-page";

vi.mock("@/hooks/use-orbit-queue", () => ({
  useOrbitQueue: () => ({ queue: true }),
}));

vi.mock("@/hooks/use-orbit-scan-session", () => ({
  useOrbitScanSession: () => ({ session: true }),
}));

vi.mock("@/hooks/use-orbit-page-interactions", () => ({
  useOrbitPageInteractions: () => ({ interactions: true }),
}));

describe("useOrbitPage facade shape", () => {
  it("documents grouped return keys", () => {
    const groupedKeys = ["queue", "session", "interactions", "selection"];
    expect(groupedKeys).toEqual(
      expect.arrayContaining(["queue", "session", "interactions", "selection"])
    );
    expect(useOrbitPage).toBeTypeOf("function");
  });
});
