"use client";

import { useEffect, useRef } from "react";

import {
  clearOrbitScanSnapshotOnServer,
  fetchOrbitScanSnapshotFromServer,
  saveOrbitScanSnapshotToServer,
} from "@/lib/orbit-scan-snapshot-client";
import {
  clearOrbitScanSnapshot,
  loadOrbitScanSnapshot,
  saveOrbitScanSnapshot,
} from "@/lib/orbit-scan-snapshot";
import type { OrbitScanResponsePayload } from "@/types";

const REMOTE_SAVE_DEBOUNCE_MS = 600;

type UseOrbitScanSnapshotSyncOptions = {
  userId: string | null;
  plan: OrbitScanResponsePayload | null;
  scanning: boolean;
  dismissedBookmarkIds: Iterable<string>;
  appliedBookmarkIds: Iterable<string>;
  restoreScanSnapshot: (
    payload: OrbitScanResponsePayload,
    dismissedBookmarkIds: Iterable<string>
  ) => void;
  restoreScanContext: (key: string | null) => void;
  scanContextKey: string;
  setAppliedBookmarkIds: (ids: Set<string>) => void;
};

/**
 * Rehydrate a paid scan from sessionStorage, then the server row, and keep
 * both in sync while the plan is active. A failed GET never deletes the
 * durable row; explicit clear or a successful empty restore may.
 */
export function useOrbitScanSnapshotSync(
  options: UseOrbitScanSnapshotSyncOptions
) {
  const {
    userId,
    plan,
    scanning,
    dismissedBookmarkIds,
    appliedBookmarkIds,
    restoreScanSnapshot,
    restoreScanContext,
    scanContextKey,
    setAppliedBookmarkIds,
  } = options;

  const restoreAttemptedRef = useRef(false);
  const remoteClearAllowedRef = useRef(false);
  const pendingRestoredSnapshotRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const persistGenerationRef = useRef(0);
  const planRef = useRef(plan);
  const scanningRef = useRef(scanning);

  useEffect(() => {
    planRef.current = plan;
    scanningRef.current = scanning;
  }, [plan, scanning]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (!userId) return;

    if (plan || scanning) {
      restoreAttemptedRef.current = true;
      remoteClearAllowedRef.current = true;
      return;
    }

    const local = loadOrbitScanSnapshot(userId);
    if (local) {
      pendingRestoredSnapshotRef.current = true;
      restoreScanSnapshot(local.payload, local.dismissedBookmarkIds);
      restoreScanContext(local.scanContextKey ?? null);
      setAppliedBookmarkIds(new Set(local.appliedBookmarkIds));
      restoreAttemptedRef.current = true;
      remoteClearAllowedRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchOrbitScanSnapshotFromServer(userId);
        if (cancelled) return;
        remoteClearAllowedRef.current = true;
        if (!remote || planRef.current || scanningRef.current) return;
        pendingRestoredSnapshotRef.current = true;
        restoreScanSnapshot(remote.payload, remote.dismissedBookmarkIds);
        restoreScanContext(remote.scanContextKey ?? null);
        saveOrbitScanSnapshot({
          userId,
          payload: remote.payload,
          dismissedBookmarkIds: remote.dismissedBookmarkIds,
          appliedBookmarkIds: remote.appliedBookmarkIds,
          scanContextKey: remote.scanContextKey,
        });
        setAppliedBookmarkIds(new Set(remote.appliedBookmarkIds));
      } catch {
        // Leave remoteClearAllowed false so a failed GET cannot wipe the row.
      } finally {
        if (!cancelled) restoreAttemptedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    plan,
    restoreScanContext,
    restoreScanSnapshot,
    scanning,
    setAppliedBookmarkIds,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !restoreAttemptedRef.current) return;

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    if (plan) {
      pendingRestoredSnapshotRef.current = false;
      const args = {
        userId,
        payload: plan,
        dismissedBookmarkIds,
        appliedBookmarkIds,
        scanContextKey,
      };
      saveOrbitScanSnapshot(args);
      remoteClearAllowedRef.current = true;
      const generation = ++persistGenerationRef.current;
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        if (generation !== persistGenerationRef.current) return;
        void saveOrbitScanSnapshotToServer(args).catch(() => {
          // Local cache already holds the plan; retry on the next change.
        });
      }, REMOTE_SAVE_DEBOUNCE_MS);
      return;
    }

    persistGenerationRef.current += 1;
    if (pendingRestoredSnapshotRef.current) {
      // Parent has not adopted the restored plan yet; keep the cache.
      return;
    }
    clearOrbitScanSnapshot(userId);
    if (!remoteClearAllowedRef.current) return;
    void clearOrbitScanSnapshotOnServer().catch(() => {
      // Next successful save or explicit clear retries.
    });
  }, [appliedBookmarkIds, dismissedBookmarkIds, plan, scanContextKey, userId]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);
}
