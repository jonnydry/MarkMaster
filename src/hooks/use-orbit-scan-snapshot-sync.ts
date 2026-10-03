"use client";

import { useCallback, useEffect, useRef } from "react";

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

type SnapshotSaveArgs = Parameters<typeof saveOrbitScanSnapshotToServer>[0];

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
  // The server is known to hold no snapshot (empty restore or a clear already
  // sent), so a plan-less render needs no DELETE. Without this, every scan
  // context change with no plan — queue paging, each search keystroke — sent
  // another DELETE for a row that was never there.
  const remoteKnownEmptyRef = useRef(false);
  const pendingRestoredSnapshotRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const pendingRemoteSaveRef = useRef<SnapshotSaveArgs | null>(null);
  const persistedArgsRef = useRef<SnapshotSaveArgs | null>(null);
  const persistGenerationRef = useRef(0);
  // Remote writes go out one at a time, in order. Otherwise a DELETE sent
  // while a PUT is in flight can commit first on another server instance and
  // leave a dismissed plan stored (and, with the known-empty skip, keep it).
  const remoteWritesRef = useRef<Promise<unknown>>(Promise.resolve());
  const queueRemoteWrite = useCallback((write: () => Promise<void>) => {
    const run = remoteWritesRef.current.then(write, write);
    remoteWritesRef.current = run.catch(() => {});
    return run;
  }, []);
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
        if (!remote) {
          remoteKnownEmptyRef.current = true;
          return;
        }
        if (planRef.current || scanningRef.current) return;
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

    if (plan) {
      const last = persistedArgsRef.current;
      if (
        last &&
        last.userId === userId &&
        last.payload === plan &&
        last.dismissedBookmarkIds === dismissedBookmarkIds &&
        last.appliedBookmarkIds === appliedBookmarkIds &&
        last.scanContextKey === scanContextKey
      ) {
        // Effects re-run when the kept Orbit page is shown again; nothing
        // changed, so there is nothing to save.
        return;
      }
    }

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingRemoteSaveRef.current = null;

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
      persistedArgsRef.current = args;
      remoteClearAllowedRef.current = true;
      remoteKnownEmptyRef.current = false;
      const generation = ++persistGenerationRef.current;
      pendingRemoteSaveRef.current = args;
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        pendingRemoteSaveRef.current = null;
        if (generation !== persistGenerationRef.current) return;
        void queueRemoteWrite(() => saveOrbitScanSnapshotToServer(args)).catch(
          () => {
            // Local cache already holds the plan; retry on the next change.
          }
        );
      }, REMOTE_SAVE_DEBOUNCE_MS);
      return;
    }

    persistedArgsRef.current = null;
    persistGenerationRef.current += 1;
    if (pendingRestoredSnapshotRef.current) {
      // Parent has not adopted the restored plan yet; keep the cache.
      return;
    }
    clearOrbitScanSnapshot(userId);
    if (!remoteClearAllowedRef.current || remoteKnownEmptyRef.current) return;
    remoteKnownEmptyRef.current = true;
    void queueRemoteWrite(clearOrbitScanSnapshotOnServer).catch(() => {
      // Next successful save or explicit clear retries.
      remoteKnownEmptyRef.current = false;
    });
  }, [
    appliedBookmarkIds,
    dismissedBookmarkIds,
    plan,
    queueRemoteWrite,
    scanContextKey,
    userId,
  ]);

  // Teardown (the kept page was hidden, or unmounted) mid-debounce: send the
  // pending save now instead of dropping it.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current === null) return;
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
      const pending = pendingRemoteSaveRef.current;
      pendingRemoteSaveRef.current = null;
      if (!pending) return;
      void queueRemoteWrite(() => saveOrbitScanSnapshotToServer(pending)).catch(
        () => {
          // Local cache already holds the plan; retry on the next change.
        }
      );
    };
  }, [queueRemoteWrite]);
}
