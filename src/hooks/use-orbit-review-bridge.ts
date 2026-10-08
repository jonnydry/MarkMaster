"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "@/lib/toast";

import { chunkDecisionEvents } from "@/lib/orbit-decision-event-batch";
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
import { FetchJsonError, sendJson, type JsonValue } from "@/lib/fetch-json";
import type {
  OrbitDecisionEventPayload,
  OrbitScanPlan,
} from "@/types";

type OrbitScanApi = ReturnType<typeof useOrbitScan>;

const DECISION_EVENT_RETRY_DELAYS_MS = [2_000, 8_000];

function isRetryableDecisionEventError(err: unknown) {
  if (!(err instanceof FetchJsonError)) return true;
  return err.status === 429 || err.status >= 500;
}

/**
 * Best-effort learning signal. Each failed batch retries in the background
 * with backoff (3 attempts), then drops. Retries are serial, so the same
 * events are never in flight twice. The server inserts blindly, which keeps
 * the duplicate window to a response lost after commit. Anything still queued
 * is lost if the tab closes.
 */
async function postDecisionEventsWithRetry(events: OrbitDecisionEventPayload[]) {
  for (const batch of chunkDecisionEvents(events)) {
    const body = JSON.parse(JSON.stringify({ events: batch })) as JsonValue;
    for (let attempt = 0; ; attempt += 1) {
      try {
        await sendJson("/api/orbit/decision-events", { method: "POST", body });
        break;
      } catch (err) {
        const delayMs = DECISION_EVENT_RETRY_DELAYS_MS[attempt];
        const retryable = isRetryableDecisionEventError(err);
        if (delayMs === undefined || !retryable) {
          const detail =
            !retryable && err instanceof FetchJsonError
              ? `failed without retry (non-retryable status ${err.status})`
              : `failed after ${attempt + 1} attempts`;
          console.warn(`[orbit] decision event write ${detail}:`, err);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

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

          void postDecisionEventsWithRetry(opts.decisionEvents);
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
        toast.success("Orbit suggestion restored for this bookmark.");
        return true;
      }
      toast.message("Kept in Orbit for this pass.");
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
