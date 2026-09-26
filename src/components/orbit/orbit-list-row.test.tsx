// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildBookmarkDecision } from "@/lib/orbit-decision";
import type { BookmarkWithRelations } from "@/types";

import { OrbitListRow } from "./orbit-list-row";

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
  syncedAt: "2026-09-02T00:00:00.000Z",
  tags: [],
  collectionItems: [],
  notes: [],
} as unknown as BookmarkWithRelations;

const decision = buildBookmarkDecision({
  bookmarkId: "bm-1",
  confidence: "high",
  reasoning: "Matched your tag.",
  tags: [{ name: "Compilers", color: "#1d9bf0", reason: "", reuseExisting: true }],
  collection: null,
});

describe("OrbitListRow", () => {
  it("shows the pending suggestion when idle", () => {
    render(<OrbitListRow bookmark={bookmark} decision={decision} />);
    expect(screen.getByText("Compilers")).toBeInTheDocument();
    expect(screen.queryByText("Matching tags…")).not.toBeInTheDocument();
  });

  it("swaps a stale suggestion for a matching state while its scan runs", () => {
    render(
      <OrbitListRow bookmark={bookmark} decision={decision} matchState="matching" />
    );
    expect(screen.getByText("Matching tags…")).toBeInTheDocument();
    expect(screen.queryByText("Compilers")).not.toBeInTheDocument();
  });

  it("previews the matched tag before the batch finishes", () => {
    render(
      <OrbitListRow bookmark={bookmark} matchState="matched" matchLabel="Compilers" />
    );
    expect(screen.getByText("Matched · Compilers")).toBeInTheDocument();
  });

  it("says Grok is naming leftovers", () => {
    render(<OrbitListRow bookmark={bookmark} matchState="naming" />);
    expect(screen.getByText("Grok is naming…")).toBeInTheDocument();
  });

  it("offers Add tag on idle rows without a dead Keep control", () => {
    render(<OrbitListRow bookmark={bookmark} />);
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Keep in Orbit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Skip suggestion" })
    ).not.toBeInTheDocument();
  });

  it("keeps Accept and Skip visible when a suggestion is pending", () => {
    render(<OrbitListRow bookmark={bookmark} decision={decision} />);
    expect(
      screen.getByRole("button", { name: "Accept suggestion" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip suggestion" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit in review" })
    ).toBeInTheDocument();
  });

  it("lets a skipped suggestion be restored", () => {
    render(
      <OrbitListRow
        bookmark={bookmark}
        decision={decision}
        dismissedBookmarkIds={new Set(["bm-1"])}
      />
    );
    expect(
      screen.getByRole("button", { name: "Restore suggestion" })
    ).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });
});