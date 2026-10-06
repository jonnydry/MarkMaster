// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookmarkWithRelations } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/hooks/use-dashboard-discovery", () => ({
  useDashboardDiscovery: vi.fn(),
}));

import { useDashboardDiscovery } from "@/hooks/use-dashboard-discovery";
import { DashboardDiscovery } from "./dashboard-discovery";

const bookmark = {
  id: "bm-1",
  tweetId: "1",
  authorId: "a1",
  authorUsername: "ada",
  authorDisplayName: "Ada",
  authorProfileImage: null,
  authorVerified: false,
  tweetText: "Notes on compilers",
  publicMetrics: null,
  media: null,
  urls: null,
  quotedTweet: null,
  xMetadata: null,
  tweetCreatedAt: "2026-09-01T00:00:00.000Z",
  bookmarkedAt: "2026-09-02T00:00:00.000Z",
  tags: [],
  collectionItems: [],
  notes: [],
} as unknown as BookmarkWithRelations;

function setDiscovery(state: {
  isLoading?: boolean;
  discoveryCarouselItems?: Array<{ bookmark: BookmarkWithRelations; context: "raw" }>;
  ritualTotal?: number;
}) {
  vi.mocked(useDashboardDiscovery).mockReturnValue({
    rawTotal: 1,
    isLoading: false,
    hasError: false,
    refetch: vi.fn(),
    refreshMix: vi.fn(),
    discoveryCarouselItems: [],
    ritualBatch: [],
    ritualTotal: 0,
    resurfacedCount: 0,
    discoveryEngagement: 0,
    itemLabels: {},
    ...state,
  } as unknown as ReturnType<typeof useDashboardDiscovery>);
}

describe("DashboardDiscovery strip height", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sizes the loading placeholder to the old skeleton, not 18rem", () => {
    setDiscovery({ isLoading: true });

    render(<DashboardDiscovery feedReady={false} />);

    const placeholder = screen.getByRole("region", { name: "Loading Discovery" });
    expect(placeholder.className).toContain("min-h-[7.25rem]");
    expect(placeholder.className).not.toContain("min-h-[18rem]");
  });

  it("does not reserve min-h-[18rem] on the loaded strip", () => {
    setDiscovery({
      discoveryCarouselItems: [{ bookmark, context: "raw" }],
      ritualTotal: 1,
    });

    render(<DashboardDiscovery feedReady />);

    const strip = screen.getByRole("region", { name: "Discovery" });
    expect(strip.className).not.toContain("min-h-[18rem]");
    expect(strip.className).not.toContain("min-h-[7.25rem]");
  });
});
