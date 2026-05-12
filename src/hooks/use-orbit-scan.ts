"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { FetchJsonError, sendJson, type JsonValue } from "@/lib/fetch-json";
import {
  buildBookmarkDecision,
  buildSingleSuggestionPlan,
  shouldCreateCollectionsForPlan,
} from "@/lib/orbit-decision";
import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import type {
  OrbitApplyResult,
  OrbitBookmarkDecision,
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
}

export interface OrbitScanState {
  plan: OrbitScanResponsePayload | null;
  scannedBookmarkIds: Set<string>;
  dismissedBookmarkIds: Set<string>;
  scanning: boolean;
  applyingBookmarkId: string | null;
  applyingBatch: boolean;
  error: OrbitScanFailure | null;
}

export interface OrbitScanHandle extends OrbitScanState {
  scanNow: (bookmarkIds: string[]) => Promise<OrbitScanResponsePayload | null>;
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
  }) => Promise<OrbitApplyResult | null>;
  dismiss: (bookmarkId: string) => void;
  getDecision: (bookmarkId: string) => OrbitBookmarkDecision | null;
  hasSuggestion: (bookmarkId: string) => boolean;
  clearPlan: () => void;
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
    case "unknown":
    default:
      return {
        kind: "unknown",
        title: "Orbit scan could not finish",
      };
  }
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
  };
}

export function useOrbitScan(): OrbitScanHandle {
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState<OrbitScanResponsePayload | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [scanning, setScanning] = useState(false);
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

  const scanNow = useCallback(
    async (bookmarkIds: string[]) => {
      const unique = Array.from(new Set(bookmarkIds));
      if (unique.length === 0) return null;
      if (unique.length > ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN) {
        setError({
          kind: "request",
          code: "scan_request",
          title: "Orbit scan request needs a refresh",
          message: `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time.`,
        });
        return null;
      }

      setScanning(true);
      setError(null);

      try {
        const result = await sendJson<
          OrbitScanResponsePayload,
          { mode: "scan"; bookmarkIds: string[] }
        >("/api/orbit/scan", {
          method: "POST",
          body: { mode: "scan", bookmarkIds: unique },
        });
        setPlan(result);
        setDismissed(new Set());
        return result;
      } catch (err) {
        setError(buildOrbitScanFailure(err, "Could not scan Orbit with Grok"));
        throw err;
      } finally {
        setScanning(false);
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
              plan: JSON.parse(JSON.stringify(filteredPlan)) as JsonValue,
            },
          }
        );

        await invalidateLibraryQueries(queryClient);

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
    [plan, queryClient]
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
              plan: JSON.parse(JSON.stringify(filteredPlan)) as JsonValue,
            },
          }
        );

        await invalidateLibraryQueries(queryClient);

        setPlan(null);
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
    async (opts: { minConfidence: OrbitScanConfidence }) => {
      if (!plan) return null;

      const pool = plan.plan.suggestions.filter(
        (suggestion) => !dismissed.has(suggestion.bookmarkId)
      );
      const filtered = pool.filter(
        (suggestion) =>
          suggestion.confidence === opts.minConfidence &&
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
              plan: JSON.parse(JSON.stringify(filteredPlan)) as JsonValue,
            },
          }
        );

        await invalidateLibraryQueries(queryClient);

        setDismissed((current) => {
          const next = new Set(current);
          for (const bookmarkId of appliedIds) {
            next.add(bookmarkId);
          }
          return next;
        });

        setPlan((current) => {
          if (!current) return null;
          const nextSuggestions = current.plan.suggestions.filter(
            (suggestion) => !appliedIds.has(suggestion.bookmarkId)
          );
          if (nextSuggestions.length === 0) return null;
          return {
            ...current,
            plan: { ...current.plan, suggestions: nextSuggestions },
          };
        });

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
              plan: JSON.parse(JSON.stringify(reviewedPlan)) as JsonValue,
            },
          }
        );

        await invalidateLibraryQueries(queryClient);

        setDismissed((current) => {
          const next = new Set(current);
          for (const bookmarkId of reviewedBookmarkIds) {
            next.add(bookmarkId);
          }
          return next;
        });

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
    setDismissed(new Set());
    setError(null);
  }, []);

  return {
    plan,
    scannedBookmarkIds,
    dismissedBookmarkIds: dismissed,
    scanning,
    applyingBookmarkId,
    applyingBatch,
    error,
    scanNow,
    applySuggestion,
    applyReviewedPlan,
    applyEntirePlan,
    applyPlanSubset,
    dismiss,
    getDecision,
    hasSuggestion,
    clearPlan,
  };
}
