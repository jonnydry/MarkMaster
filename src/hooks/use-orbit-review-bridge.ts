"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildNoOpApplyResult,
  countDecisionActions,
  formatAppliedToast,
} from "@/lib/orbit-apply-utils";
import {
  EMPTY_REVIEW_SESSION,
  type OrbitReviewSession,
} from "@/lib/orbit-client-constants";
import type { useOrbitScan } from "@/hooks/use-orbit-scan";
import { addLikedHighlightId, getHighlightFeedback } from "@/lib/highlight-feedback";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { sendJson, type JsonValue } from "@/lib/fetch-json";
import type {
  OrbitDecisionEventPayload,
  OrbitScanPlan,
} from "@/types";

type OrbitScanApi = ReturnType<typeof useOrbitScan>;

type UseOrbitReviewBridgeOptions = {
  scan: OrbitScanApi;
  setActiveBookmarkId: (id: string | null) => void;
  onReviewClose?: () => void;
};

export function useOrbitReviewBridge(options: UseOrbitReviewBridgeOptions) {
  const { scan, setActiveBookmarkId, onReviewClose } = options;

  const [reviewSession, setReviewSession] =
    useState<OrbitReviewSession>(EMPTY_REVIEW_SESSION);
  const [feedbackById, setFeedbackById] = useState<
    Record<string, "good" | "not_relevant">
  >({});

  const handleOpenBookmarkReview = useCallback(
    (bookmarkId: string) => {
      if (!scan.plan) {
        toast.message("Run a scan first to open Review pass.");
        return;
      }
      setActiveBookmarkId(bookmarkId);
      setReviewSession((current) => ({
        open: true,
        focusBookmarkId: bookmarkId,
        digestBookmarkIds: null,
        source: null,
        sessionId: current.sessionId + 1,
      }));
    },
    [scan.plan, setActiveBookmarkId]
  );

  const handleReviewOpenChange = useCallback(
    (open: boolean) => {
      setReviewSession((current) => ({
        open,
        focusBookmarkId: open ? current.focusBookmarkId : null,
        digestBookmarkIds: open ? current.digestBookmarkIds : null,
        source: open ? current.source : null,
        sessionId: current.sessionId,
      }));

      if (!open) {
        setFeedbackById({});
        onReviewClose?.();
      }
    },
    [onReviewClose]
  );

  const handleOpenReviewAll = useCallback(() => {
    if (!scan.plan) return;
    setReviewSession((current) => ({
      open: true,
      focusBookmarkId: null,
      digestBookmarkIds: null,
      source: null,
      sessionId: current.sessionId + 1,
    }));
  }, [scan.plan]);

  const handleApplyReviewedPlan = useCallback(
    async (
      reviewedPlan: OrbitScanPlan,
      opts: {
        createCollections: boolean;
        keptBookmarkIds: string[];
        decisionEvents: OrbitDecisionEventPayload[];
      }
    ) => {
      try {
        const hasMutations = reviewedPlan.suggestions.length > 0;
        const applied = hasMutations
          ? await scan.applyReviewedPlan(reviewedPlan, {
              createCollections: opts.createCollections,
            })
          : null;

        if (hasMutations && !applied) return null;

        if (opts.decisionEvents.length > 0) {
          const decisionCounts = countDecisionActions(opts.decisionEvents);
          trackFlywheelEvent("orbit.review.applied", {
            scanRunId: scan.plan?.scanRunId ?? null,
            total: opts.decisionEvents.length,
            ...decisionCounts,
          });

          try {
            await sendJson("/api/orbit/decision-events", {
              method: "POST",
              body: JSON.parse(
                JSON.stringify({ events: opts.decisionEvents })
              ) as JsonValue,
            });
          } catch (err) {
            console.warn("[orbit] decision event write failed:", err);
          }
        }

        for (const bookmarkId of opts.keptBookmarkIds) {
          scan.dismiss(bookmarkId);
        }

        if (reviewSession.digestBookmarkIds && opts.keptBookmarkIds.length > 0) {
          for (const id of opts.keptBookmarkIds) {
            if (getHighlightFeedback(id) === null) {
              addLikedHighlightId(id);
            }
          }
        }

        const keptMessage =
          opts.keptBookmarkIds.length > 0
            ? `Kept ${opts.keptBookmarkIds.length} in Orbit`
            : null;
        const appliedMessage = applied
          ? `Applied review · ${formatAppliedToast(applied)}`
          : null;
        const message = [appliedMessage, keptMessage].filter(Boolean).join(" · ");

        if (message) {
          toast.success(message);
        }

        return applied ?? buildNoOpApplyResult(opts.keptBookmarkIds.length);
      } catch {
        return null;
      }
    },
    [scan, reviewSession.digestBookmarkIds]
  );

  const handleKeepInOrbit = useCallback(
    (bookmarkId: string) => {
      const wasDismissed = scan.dismissedBookmarkIds.has(bookmarkId);
      scan.toggleDismiss(bookmarkId);
      if (wasDismissed) {
        toast.success("Grok suggestion restored for this bookmark.");
        return true;
      }
      toast("Kept in Orbit for this pass.");
      return false;
    },
    [scan]
  );

  return useMemo(
    () => ({
      reviewSession,
      setReviewSession,
      feedbackById,
      handleOpenBookmarkReview,
      handleReviewOpenChange,
      handleOpenReviewAll,
      handleApplyReviewedPlan,
      handleKeepInOrbit,
    }),
    [
      reviewSession,
      feedbackById,
      handleOpenBookmarkReview,
      handleReviewOpenChange,
      handleOpenReviewAll,
      handleApplyReviewedPlan,
      handleKeepInOrbit,
    ]
  );
}
