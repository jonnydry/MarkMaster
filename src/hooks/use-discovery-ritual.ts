"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackFlywheelEvent } from "@/lib/flywheel";
import type { BookmarkWithRelations } from "@/types";

const NURTURED_STORAGE_KEY = "markmaster:digest-nurtured";

export interface UseDiscoveryRitualOptions {
  /** The set of bookmarks for the batch ritual (used for digestIds payload and counts) */
  batch: BookmarkWithRelations[];
  onSaveAsCollection?: (items: BookmarkWithRelations[], suggestedName: string) => void;
}

export interface UseDiscoveryRitualReturn {
  nurturedCount: number;
  celebration: { gems: number; engagement: number } | null;
  handleReviewInOrbit: () => void;
  handleSaveAsCollection: () => void;
}

/**
 * Shared hook for the "Review full mix / batch ritual" experience.
 *
 * Centralizes:
 * - nurturedCount persistence (localStorage)
 * - celebration banner state
 * - handleReviewInOrbit (fires cta.digest_review_together, increments nurture, navigates with digestIds + source=weekly-gems)
 * - handleSaveAsCollection
 *
 * Used by both the unified Discovery carousel (dashboard-discovery.tsx)
 * and the standalone/embedded WeeklyDigestPanel to keep behavior identical.
 *
 * Extracted during Phase 1 cleanup pass after the Unified High-Engagement
 * Discovery Carousel work.
 */
export function useDiscoveryRitual({
  batch,
  onSaveAsCollection,
}: UseDiscoveryRitualOptions): UseDiscoveryRitualReturn {
  const router = useRouter();

  const [nurturedCount, setNurturedCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    const n = parseInt(localStorage.getItem(NURTURED_STORAGE_KEY) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  });

  const [celebration, setCelebration] = useState<null | { gems: number; engagement: number }>(
    null
  );

  const incrementNurtured = (delta: number) => {
    const next = nurturedCount + delta;
    setNurturedCount(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(NURTURED_STORAGE_KEY, String(next));
    }
  };

  const handleReviewInOrbit = () => {
    if (batch.length === 0) return;

    const gemsCount = batch.length;
    // Compute engagement at call time (same as previous implementations)
    const eng = batch.reduce((sum, b) => {
      const m = b.publicMetrics;
      if (!m) return sum;
      return sum + (m.like_count || 0) + (m.reply_count || 0) + (m.bookmark_count || 0);
    }, 0);

    incrementNurtured(gemsCount);
    trackFlywheelEvent("cta.digest_review_together", { gems: gemsCount });
    setCelebration({ gems: gemsCount, engagement: eng });

    setTimeout(() => {
      setCelebration(null);
      const ids = batch.map((b) => b.id).join(",");
      router.push(`/orbit?digestIds=${ids}&source=weekly-gems`);
    }, 400);
  };

  const handleSaveAsCollection = () => {
    if (!onSaveAsCollection || batch.length === 0) return;

    const gemsCount = batch.length;
    const eng = batch.reduce((sum, b) => {
      const m = b.publicMetrics;
      if (!m) return sum;
      return sum + (m.like_count || 0) + (m.reply_count || 0) + (m.bookmark_count || 0);
    }, 0);

    incrementNurtured(gemsCount);
    setCelebration({ gems: gemsCount, engagement: eng });
    setTimeout(() => setCelebration(null), 3800);

    onSaveAsCollection(batch, "This Week’s Gems");
  };

  return {
    nurturedCount,
    celebration,
    handleReviewInOrbit,
    handleSaveAsCollection,
  };
}
