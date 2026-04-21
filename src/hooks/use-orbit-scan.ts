"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { sendJson, type JsonValue } from "@/lib/fetch-json";
import {
  buildBookmarkDecision,
  buildSingleSuggestionPlan,
} from "@/lib/orbit-decision";
import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-grok";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import type {
  OrbitApplyResult,
  OrbitBookmarkDecision,
  OrbitScanPlan,
  OrbitScanResponsePayload,
} from "@/types";

export type OrbitScanApplyVariant = "primary" | "alt" | "batch";

export interface OrbitScanState {
  plan: OrbitScanResponsePayload | null;
  scannedBookmarkIds: Set<string>;
  dismissedBookmarkIds: Set<string>;
  scanning: boolean;
  applyingBookmarkId: string | null;
  applyingBatch: boolean;
  error: string | null;
}

export interface OrbitScanHandle extends OrbitScanState {
  scanNow: (bookmarkIds: string[]) => Promise<OrbitScanResponsePayload | null>;
  applySuggestion: (
    bookmarkId: string,
    variant: "primary" | "alt"
  ) => Promise<OrbitApplyResult | null>;
  applyEntirePlan: (opts?: {
    createCollections?: boolean;
  }) => Promise<OrbitApplyResult | null>;
  dismiss: (bookmarkId: string) => void;
  getDecision: (bookmarkId: string) => OrbitBookmarkDecision | null;
  hasSuggestion: (bookmarkId: string) => boolean;
  clearPlan: () => void;
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
  const [error, setError] = useState<string | null>(null);

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
        setError(
          `Scan up to ${ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN} bookmarks at a time.`
        );
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
        const message =
          err instanceof Error ? err.message : "Could not scan Orbit with Grok";
        setError(message);
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
              createCollections: variant === "primary",
              plan: JSON.parse(JSON.stringify(filteredPlan)) as JsonValue,
            },
          }
        );

        await invalidateLibraryQueries(queryClient);
        await queryClient.invalidateQueries({ queryKey: ["orbit", "graph"] });

        setDismissed((current) => {
          const next = new Set(current);
          next.add(bookmarkId);
          return next;
        });

        return response.applied;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not apply suggestion";
        setError(message);
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
        await queryClient.invalidateQueries({ queryKey: ["orbit", "graph"] });

        setPlan(null);
        setDismissed(new Set());

        return response.applied;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not apply plan";
        setError(message);
        throw err;
      } finally {
        setApplyingBatch(false);
      }
    },
    [plan, dismissed, queryClient]
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
    applyEntirePlan,
    dismiss,
    getDecision,
    hasSuggestion,
    clearPlan,
  };
}
