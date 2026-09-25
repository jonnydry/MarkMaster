"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { FetchJsonError, sendJson, type JsonValue } from "@/lib/fetch-json";
import { trackFlywheelEvent } from "@/lib/flywheel";
import {
  buildBookmarkDecision,
  buildSingleSuggestionPlan,
  isSafeAutoApplySuggestion,
  shouldCreateCollectionsForPlan,
} from "@/lib/orbit-decision";
import { ORBIT_JEV_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import {
  applyOrbitScanProgressEvent,
  requestOrbitScanStream,
  startOrbitScanProgress,
  type OrbitScanProgress,
} from "@/lib/orbit-scan-stream";
import { invalidateOrbitApplyQueries } from "@/lib/query-invalidation";
import type {
  BookmarkWithRelations,
  OrbitApplyResult,
  OrbitBookmarkDecision,
  OrbitScanBatchMetadata,
  OrbitScanConfidence,
  OrbitScanErrorPayload,
  OrbitScanFailureCode,
  OrbitScanPlan,
  OrbitScanResponsePayload,
} from "@/types";

export type OrbitScanApplyVariant = "primary" | "alt" | "batch";
export type OrbitScanFailureKind =
  | "auth"
  | "model"
  | "rate-limit"
  | "provider"
  | "request"
  | "unknown";

export interface OrbitScanFailure {
  kind: OrbitScanFailureKind;
  code: OrbitScanFailureCode;
  title: string;
  message: string;
  retryAfterSeconds?: number;
  recoveryHref?: string;
  recoveryLabel?: string;
}

export interface OrbitScanState {
  plan: OrbitScanResponsePayload | null;
  scannedBookmarks: BookmarkWithRelations[];
  scannedBookmarkIds: Set<string>;
  dismissedBookmarkIds: Set<string>;
  scanning: boolean;
  /** Live per-row progress while a scan runs; null otherwise. */
  progress: OrbitScanProgress | null;
  applyingBookmarkId: string | null;
  applyingBatch: boolean;
  error: OrbitScanFailure | null;
}

export interface OrbitScanHandle extends OrbitScanState {
  scanNow: (
    bookmarkIds: string[],
    batch?: OrbitScanBatchMetadata
  ) => Promise<OrbitScanResponsePayload | null>;
  applySuggestion: (
    bookmarkId: string,
    variant: "primary" | "alt"
  ) => Promise<OrbitApplyResult | null>;
  applyReviewedPlan: (
    reviewedPlan: OrbitScanPlan,
    opts?: { createCollections?: boolean }
  ) => Promise<OrbitApplyResult | null>;
  applyEntirePlan: (opts?: {
    createCollections?: boolean;
  }) => Promise<OrbitApplyResult | null>;
  applyPlanSubset: (opts: {
    minConfidence: OrbitScanConfidence;
    safeExistingOnly?: boolean;
  }) => Promise<OrbitApplyResult | null>;
  /** Skip this bookmark for the current scan pass (idempotent). */
  dismiss: (bookmarkId: string) => void;
  /** Skip or restore an Orbit suggestion for the current pass. */
  toggleDismiss: (bookmarkId: string) => void;
  getDecision: (bookmarkId: string) => OrbitBookmarkDecision | null;
  hasSuggestion: (bookmarkId: string) => boolean;
  clearPlan: () => void;
  refreshAppliedQueries: () => Promise<unknown>;
  /**
   * Restore a previously persisted scan plan + review progress (UX-H1).
   * No flywheel event fires — the scan already reported completion when it
   * originally ran. No-op while a scan is in flight; callers should only
   * restore when no plan exists.
   */
  restoreScanSnapshot: (
    payload: OrbitScanResponsePayload,
    dismissedBookmarkIds: Iterable<string>
  ) => void;
}

export type OrbitScanApi = OrbitScanHandle;

export function removeSuggestionsFromScanPlan(
  current: OrbitScanResponsePayload | null,
  bookmarkIds: Iterable<string>
): OrbitScanResponsePayload | null {
  if (!current) return null;

  const removed = new Set(bookmarkIds);
  if (removed.size === 0) return current;

  const nextSuggestions = current.plan.suggestions.filter(
    (suggestion) => !removed.has(suggestion.bookmarkId)
  );
  if (nextSuggestions.length === 0) return null;

  return {
    ...current,
    plan: { ...current.plan, suggestions: nextSuggestions },
  };
}

function isOrbitScanErrorPayload(value: unknown): value is OrbitScanErrorPayload {
  if (!value || typeof value !== "object") return false;

  return (
    "error" in value &&
    typeof (value as { error: unknown }).error === "string" &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    (!("retryAfterSeconds" in value) ||
      typeof (value as { retryAfterSeconds: unknown }).retryAfterSeconds ===
        "number" ||
      typeof (value as { retryAfterSeconds: unknown }).retryAfterSeconds ===
        "undefined")
  );
}

function classifyOrbitScanFailure(code: OrbitScanFailureCode): {
  kind: OrbitScanFailureKind;
  title: string;
} {
  switch (code) {
    case "xai_auth":
      return {
        kind: "auth",
        title: "xAI credentials need attention",
      };
    case "typesafe_auth":
      return {
        kind: "auth",
        title: "TypeSafe credentials need attention",
      };
    case "xai_model":
      return {
        kind: "model",
        title: "Configured Grok model is unavailable",
      };
    case "xai_rate_limited":
      return {
        kind: "rate-limit",
        title: "xAI rate limit reached",
      };
    case "scan_request":
    case "bookmark_not_found":
      return {
        kind: "request",
        title: "Orbit scan request needs a refresh",
      };
    case "xai_unavailable":
    case "xai_response":
      return {
        kind: "provider",
        title: "Grok scan could not finish",
      };
    case "typesafe_unavailable":
      return {
        kind: "provider",
        title: "Jev could not finish the Orbit assignment",
      };
    case "unknown":
    default:
      return {
        kind: "unknown",
        title: "Orbit scan could not finish",
      };
  }
}

function buildOrbitScanRecovery(code: OrbitScanFailureCode):
  | { recoveryHref: string; recoveryLabel: string }
  | undefined {
  if (code !== "xai_auth" && code !== "xai_model" && code !== "typesafe_auth") {
    return undefined;
  }

  return {
    recoveryHref: `/settings?orbitIssue=${encodeURIComponent(code)}#orbit-grok`,
    recoveryLabel: "Fix in Settings",
  };
}

export function buildOrbitScanCompletedFlywheelPayload(args: {
  result: OrbitScanResponsePayload;
  requestedBookmarkIds: string[];
  durationMs: number;
}) {
  const suggestions = args.result.plan.suggestions;
  const usefulSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.tags.length > 0 || suggestion.collection !== null
  ).length;
  const modelAbstains = suggestions.filter(
    (suggestion) =>
      suggestion.confidence === "low" &&
      suggestion.tags.length === 0 &&
      suggestion.collection === null
  ).length;
  const reusedExistingTags = suggestions.reduce(
    (total, suggestion) =>
      total + suggestion.tags.filter((tag) => tag.reuseExisting).length,
    0
  );
  const newTags = suggestions.reduce(
    (total, suggestion) =>
      total + suggestion.tags.filter((tag) => !tag.reuseExisting).length,
    0
  );
  const reusedExistingCollections = suggestions.filter(
    (suggestion) => suggestion.collection?.reuseExisting
  ).length;
  const newCollections = suggestions.filter(
    (suggestion) => suggestion.collection && !suggestion.collection.reuseExisting
  ).length;

  return {
    scanRunId: args.result.scanRunId,
    durationMs: args.durationMs,
    requestedCount: args.requestedBookmarkIds.length,
    candidatePoolCount: args.result.batch.candidatePoolCount,
    profile: args.result.batch.profile,
    mode: args.result.batch.mode,
    usefulSuggestions,
    highConfidence: suggestions.filter(
      (suggestion) => suggestion.confidence === "high"
    ).length,
    mediumConfidence: suggestions.filter(
      (suggestion) => suggestion.confidence === "medium"
    ).length,
    lowConfidence: suggestions.filter(
      (suggestion) => suggestion.confidence === "low"
    ).length,
    modelAbstains,
    sourceUnknowns: args.result.batch.selectedSourceUnknownCount,
    safeAutoApplyCount: suggestions.filter(isSafeAutoApplySuggestion).length,
    // Flat primitives only: the flywheel ingest schema allows one level of
    // nesting, so enrichment counters are flattened into this group.
    signalQuality: {
      richCount: args.result.batch.signalQuality?.richCount ?? 0,
      sparseCount: args.result.batch.signalQuality?.sparseCount ?? 0,
      enrichmentAttempted: args.result.batch.enrichment?.attempted ?? null,
      enrichmentRefreshed: args.result.batch.enrichment?.refreshed ?? null,
      enrichmentSkipped: args.result.batch.enrichment?.skipped ?? null,
      enrichmentFailed: args.result.batch.enrichment?.failed ?? null,
    },
    suggestionOutcomes: {
      reusedExistingTags,
      newTags,
      reusedExistingCollections,
      newCollections,
      abstained: modelAbstains,
    },
    ...(args.result.batch.hybrid
      ? {
          hybrid: {
            firstPassLeftovers: args.result.batch.hybrid.firstPassLeftovers,
            refinedLeftovers: args.result.batch.hybrid.refinedLeftovers,
            recoveredOnRefine: args.result.batch.hybrid.recoveredOnRefine,
            escalatedToGrok: args.result.batch.hybrid.escalatedToGrok,
          },
        }
      : {}),
  };
}

export function buildOrbitScanFailure(
  err: unknown,
  fallbackMessage: string
): OrbitScanFailure {
  const payload =
    err instanceof FetchJsonError && isOrbitScanErrorPayload(err.body)
      ? err.body
      : null;
  const code = payload?.code ?? "unknown";
  const { kind, title } = classifyOrbitScanFailure(code);
  const message =
    payload?.error ?? (err instanceof Error ? err.message : fallbackMessage);

  return {
    kind,
    code,
    title,
    message,
    retryAfterSeconds: payload?.retryAfterSeconds,
    ...buildOrbitScanRecovery(code),
  };
}

export function useOrbitScan(): OrbitScanHandle {
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState<OrbitScanResponsePayload | null>(null);
  const [scannedBookmarks, setScannedBookmarks] = useState<BookmarkWithRelations[]>(
    () => []
  );
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<OrbitScanProgress | null>(null);
  const [applyingBookmarkId, setApplyingBookmarkId] = useState<string | null>(
    null
  );
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [error, setError] = useState<OrbitScanFailure | null>(null);

  const decisionsByBookmarkId = useMemo(() => {
    if (!plan) return new Map<string, OrbitBookmarkDecision>();
    return new Map(
      plan.plan.suggestions.map((suggestion) => [
        suggestion.bookmarkId,
        buildBookmarkDecision(suggestion),
      ])
    );
  }, [plan]);

  const scannedBookmarkIds = useMemo(
    () => new Set(decisionsByBookmarkId.keys()),
    [decisionsByBookmarkId]
  );

  // Refuse overlapping scans synchronously (double-click, digest + manual
  // trigger racing) and tag each request so a superseded response can never
  // overwrite newer state.
  const scanInFlightRef = useRef(false);
  const scanRequestIdRef = useRef(0);

  const scanNow = useCallback(
    async (bookmarkIds: string[], batch?: OrbitScanBatchMetadata) => {
      const unique = Array.from(new Set(bookmarkIds));
      if (unique.length === 0) return null;
      if (unique.length > ORBIT_JEV_MAX_BOOKMARKS_PER_SCAN) {
        setError({
          kind: "request",
          code: "scan_request",
          title: "Orbit scan request needs a refresh",
          message: `Scan up to ${ORBIT_JEV_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time.`,
        });
        return null;
      }

      if (scanInFlightRef.current) return null;
      scanInFlightRef.current = true;
      const requestId = ++scanRequestIdRef.current;

      setScanning(true);
      setProgress(startOrbitScanProgress(unique));
      setError(null);
      const startedAt = Date.now();

      try {
        const result = await requestOrbitScanStream({
          bookmarkIds: unique,
          batch,
          onProgress: (event) => {
            if (requestId !== scanRequestIdRef.current) return;
            setProgress((current) =>
              current ? applyOrbitScanProgressEvent(current, event) : current
            );
          },
        });
        if (requestId !== scanRequestIdRef.current) return null;
        setPlan(result);
        setScannedBookmarks(result.scannedBookmarks ?? []);
        setDismissed(new Set());
        const durationMs = Date.now() - startedAt;
        trackFlywheelEvent(
          "orbit.scan.completed",
          buildOrbitScanCompletedFlywheelPayload({
            result,
            requestedBookmarkIds: unique,
            durationMs,
          })
        );
        return result;
      } catch (err) {
        const failure = buildOrbitScanFailure(
          err,
          "Could not scan Orbit"
        );
        if (requestId === scanRequestIdRef.current) {
          setError(failure);
        }
        trackFlywheelEvent("orbit.scan.failed", {
          durationMs: Date.now() - startedAt,
          requestedCount: unique.length,
          profile: batch?.profile ?? null,
          mode: batch?.mode ?? null,
          code: failure.code,
        });
        throw err;
      } finally {
        if (requestId === scanRequestIdRef.current) {
          scanInFlightRef.current = false;
          setScanning(false);
          setProgress(null);
        }
      }
    },
    []
  );

  const applySuggestion = useCallback(
    async (bookmarkId: string, variant: "primary" | "alt") => {
      if (!plan) return null;
      const filteredPlan = buildSingleSuggestionPlan(
        plan.plan,
        bookmarkId,
        variant
      );
      if (!filteredPlan) return null;

      setApplyingBookmarkId(bookmarkId);
      setError(null);

      try {
        const response = await sendJson<{ applied: OrbitApplyResult }>(
          "/api/orbit/scan",
          {
            method: "POST",
            body: {
              mode: "apply",
              createCollections: shouldCreateCollectionsForPlan(filteredPlan),
              plan: structuredClone(filteredPlan) as unknown as JsonValue,
            },
          }
        );

        const remaining = plan.plan.suggestions.filter(
          (suggestion) =>
            suggestion.bookmarkId !== bookmarkId &&
            !dismissed.has(suggestion.bookmarkId)
        );
        await invalidateOrbitApplyQueries(queryClient, {
          refetchType: remaining.length === 0 ? "active" : "none",
        });

        setDismissed((current) => {
          const next = new Set(current);
          next.add(bookmarkId);
          return next;
        });

        return response.applied;
      } catch (err) {
        setError(buildOrbitScanFailure(err, "Could not apply suggestion"));
        throw err;
      } finally {
        setApplyingBookmarkId(null);
      }
    },
    [dismissed, plan, queryClient]
  );

  const applyEntirePlan = useCallback(
    async (opts?: { createCollections?: boolean }) => {
      if (!plan) return null;

      const activeSuggestions = plan.plan.suggestions.filter(
        (suggestion) => !dismissed.has(suggestion.bookmarkId)
      );
      if (activeSuggestions.length === 0) return null;

      const filteredPlan: OrbitScanPlan = {
        overview: plan.plan.overview,
        suggestions: activeSuggestions,
      };

      setApplyingBatch(true);
      setError(null);

      try {
        const response = await sendJson<{ applied: OrbitApplyResult }>(
          "/api/orbit/scan",
          {
            method: "POST",
            body: {
              mode: "apply",
              createCollections: opts?.createCollections ?? true,
              plan: structuredClone(filteredPlan) as unknown as JsonValue,
            },
          }
        );

        await invalidateOrbitApplyQueries(queryClient);

        setPlan(null);
        setScannedBookmarks([]);
        setDismissed(new Set());

        return response.applied;
      } catch (err) {
        setError(buildOrbitScanFailure(err, "Could not apply plan"));
        throw err;
      } finally {
        setApplyingBatch(false);
      }
    },
    [plan, dismissed, queryClient]
  );

  const applyPlanSubset = useCallback(
    async (opts: {
      minConfidence: OrbitScanConfidence;
      safeExistingOnly?: boolean;
    }) => {
      if (!plan) return null;

      const pool = plan.plan.suggestions.filter(
        (suggestion) => !dismissed.has(suggestion.bookmarkId)
      );
      const filtered = pool.filter(
        (suggestion) =>
          suggestion.confidence === opts.minConfidence &&
          (!opts.safeExistingOnly || isSafeAutoApplySuggestion(suggestion)) &&
          (suggestion.tags.length > 0 || suggestion.collection !== null)
      );
      if (filtered.length === 0) return null;

      const filteredPlan: OrbitScanPlan = {
        overview: plan.plan.overview,
        suggestions: filtered,
      };
      const createCollections = shouldCreateCollectionsForPlan(filteredPlan);
      const appliedIds = new Set(
        filteredPlan.suggestions.map((suggestion) => suggestion.bookmarkId)
      );

      setApplyingBatch(true);
      setError(null);

      try {
        const response = await sendJson<{ applied: OrbitApplyResult }>(
          "/api/orbit/scan",
          {
            method: "POST",
            body: {
              mode: "apply",
              createCollections,
              plan: structuredClone(filteredPlan) as unknown as JsonValue,
            },
          }
        );

        await invalidateOrbitApplyQueries(queryClient, {
          refetchType:
            pool.length === filtered.length ? "active" : "none",
        });

        setDismissed((current) => {
          const next = new Set(current);
          for (const bookmarkId of appliedIds) {
            next.add(bookmarkId);
          }
          return next;
        });

        setPlan((current) => removeSuggestionsFromScanPlan(current, appliedIds));

        return response.applied;
      } catch (err) {
        setError(buildOrbitScanFailure(err, "Could not apply plan subset"));
        throw err;
      } finally {
        setApplyingBatch(false);
      }
    },
    [plan, dismissed, queryClient]
  );

  const applyReviewedPlan = useCallback(
    async (
      reviewedPlan: OrbitScanPlan,
      opts?: { createCollections?: boolean }
    ) => {
      if (!plan) return null;

      const scannedBookmarkIdsForPlan = new Set(
        plan.plan.suggestions.map((suggestion) => suggestion.bookmarkId)
      );
      const reviewedBookmarkIds = Array.from(
        new Set(
          reviewedPlan.suggestions.map((suggestion) => suggestion.bookmarkId)
        )
      );

      if (reviewedBookmarkIds.length === 0) return null;

      const hasUnscannedBookmark = reviewedBookmarkIds.some(
        (bookmarkId) => !scannedBookmarkIdsForPlan.has(bookmarkId)
      );
      if (hasUnscannedBookmark) {
        setError({
          kind: "request",
          code: "scan_request",
          title: "Orbit scan request needs a refresh",
          message: "Review only the bookmarks from the current Orbit scan.",
        });
        return null;
      }

      setApplyingBatch(true);
      setError(null);

      try {
        const response = await sendJson<{ applied: OrbitApplyResult }>(
          "/api/orbit/scan",
          {
            method: "POST",
            body: {
              mode: "apply",
              createCollections: opts?.createCollections ?? true,
              plan: structuredClone(reviewedPlan) as unknown as JsonValue,
            },
          }
        );

        await invalidateOrbitApplyQueries(queryClient);

        setDismissed((current) => {
          const next = new Set(current);
          for (const bookmarkId of reviewedBookmarkIds) {
            next.add(bookmarkId);
          }
          return next;
        });

        setPlan((current) =>
          removeSuggestionsFromScanPlan(current, reviewedBookmarkIds)
        );

        return response.applied;
      } catch (err) {
        setError(buildOrbitScanFailure(err, "Could not apply reviewed plan"));
        throw err;
      } finally {
        setApplyingBatch(false);
      }
    },
    [plan, queryClient]
  );

  const dismiss = useCallback((bookmarkId: string) => {
    setDismissed((current) => {
      if (current.has(bookmarkId)) return current;
      const next = new Set(current);
      next.add(bookmarkId);
      return next;
    });
  }, []);

  const toggleDismiss = useCallback((bookmarkId: string) => {
    setDismissed((current) => {
      const next = new Set(current);
      if (next.has(bookmarkId)) {
        next.delete(bookmarkId);
      } else {
        next.add(bookmarkId);
      }
      return next;
    });
  }, []);

  const getDecision = useCallback(
    (bookmarkId: string): OrbitBookmarkDecision | null => {
      if (dismissed.has(bookmarkId)) return null;
      return decisionsByBookmarkId.get(bookmarkId) ?? null;
    },
    [decisionsByBookmarkId, dismissed]
  );

  const hasSuggestion = useCallback(
    (bookmarkId: string): boolean => {
      const decision = getDecision(bookmarkId);
      return decision?.primary !== null && decision?.primary !== undefined;
    },
    [getDecision]
  );

  const clearPlan = useCallback(() => {
    setPlan(null);
    setScannedBookmarks([]);
    setDismissed(new Set());
    setError(null);
  }, []);

  const refreshAppliedQueries = useCallback(() => {
    return invalidateOrbitApplyQueries(queryClient);
  }, [queryClient]);

  const restoreScanSnapshot = useCallback(
    (
      payload: OrbitScanResponsePayload,
      dismissedBookmarkIds: Iterable<string>
    ) => {
      if (scanInFlightRef.current) return;
      setPlan(payload);
      setScannedBookmarks(payload.scannedBookmarks ?? []);
      setDismissed(new Set(dismissedBookmarkIds));
      setError(null);
    },
    []
  );

  return {
    plan,
    scannedBookmarks,
    scannedBookmarkIds,
    dismissedBookmarkIds: dismissed,
    scanning,
    progress,
    applyingBookmarkId,
    applyingBatch,
    error,
    scanNow,
    applySuggestion,
    applyReviewedPlan,
    applyEntirePlan,
    applyPlanSubset,
    dismiss,
    toggleDismiss,
    getDecision,
    hasSuggestion,
    clearPlan,
    refreshAppliedQueries,
    restoreScanSnapshot,
  };
}
