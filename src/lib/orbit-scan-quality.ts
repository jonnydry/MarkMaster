import { ORBIT_SCAN_BATCH_PROFILES } from "./orbit-config";
import type {
  OrbitScanBatchProfileId,
  OrbitScanQualityPayload,
} from "@/types";

export interface OrbitScanQualityEvent {
  eventType: string;
  payload: unknown;
}

export interface OrbitScanReviewEvent {
  payload: unknown;
}

type ScanMetrics = {
  eventType: string;
  requestedCount: number;
  durationMs: number;
  usefulSuggestions: number;
  modelAbstains: number;
};

const QUICK_PROFILE = ORBIT_SCAN_BATCH_PROFILES.quick.id;
const BALANCED_PROFILE = ORBIT_SCAN_BATCH_PROFILES.balanced.id;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFromPayload(payload: unknown, key: string) {
  if (!isRecord(payload)) return 0;
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function scanMetricsFromEvent(event: OrbitScanQualityEvent): ScanMetrics {
  return {
    eventType: event.eventType,
    requestedCount: numberFromPayload(event.payload, "requestedCount"),
    durationMs: numberFromPayload(event.payload, "durationMs"),
    usefulSuggestions: numberFromPayload(event.payload, "usefulSuggestions"),
    modelAbstains: numberFromPayload(event.payload, "modelAbstains"),
  };
}

function median(values: number[]) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function aggregateScanRates(scans: ScanMetrics[]) {
  const requested = scans.reduce(
    (total, event) => total + event.requestedCount,
    0
  );
  const useful = scans.reduce(
    (total, event) => total + event.usefulSuggestions,
    0
  );
  const abstains = scans.reduce(
    (total, event) => total + event.modelAbstains,
    0
  );

  return {
    usefulSuggestionRate: rate(useful, requested),
    modelAbstainRate: rate(abstains, requested),
    medianDurationMs: median(scans.map((event) => event.durationMs)),
  };
}

function reviewStats(events: OrbitScanReviewEvent[]) {
  let accepted = 0;
  let edited = 0;
  let kept = 0;
  let rejected = 0;

  for (const event of events) {
    accepted += numberFromPayload(event.payload, "accepted");
    edited += numberFromPayload(event.payload, "edited");
    kept += numberFromPayload(event.payload, "kept");
    rejected += numberFromPayload(event.payload, "rejected");
  }

  const reviewedSuggestionCount = accepted + edited + kept + rejected;
  const reviewUsefulRate =
    reviewedSuggestionCount > 0
      ? (accepted + edited) / reviewedSuggestionCount
      : null;

  return { reviewedSuggestionCount, reviewUsefulRate };
}

function deepLockReason(args: {
  lastFiveSuccessfulCount: number;
  largeSuccessfulScanCount: number;
  usefulSuggestionRate: number;
  modelAbstainRate: number;
  failureRate: number;
  medianDurationMs: number;
  reviewedSuggestionCount: number;
  reviewUsefulRate: number | null;
}) {
  if (args.lastFiveSuccessfulCount < 5) {
    return "Needs 5 successful scans before Deep batches unlock.";
  }
  if (args.largeSuccessfulScanCount < 3) {
    return "Needs 3 successful scans of 20+ bookmarks before Deep unlocks.";
  }
  if (args.failureRate > 0.1) {
    return "Recent Orbit scan failures are too high for Deep batches.";
  }
  if (args.usefulSuggestionRate < 0.7) {
    return "Useful suggestion rate is below the Deep threshold.";
  }
  if (args.modelAbstainRate > 0.25) {
    return "Grok is abstaining too often for Deep batches.";
  }
  if (args.medianDurationMs > 60_000) {
    return "Recent scans are taking too long for Deep batches.";
  }
  if (
    args.reviewedSuggestionCount >= 10 &&
    (args.reviewUsefulRate ?? 0) < 0.7
  ) {
    return "Recent review outcomes are not strong enough for Deep batches.";
  }

  return "Deep batches are available.";
}

export function evaluateOrbitScanQuality(args: {
  scanEvents: OrbitScanQualityEvent[];
  reviewEvents?: OrbitScanReviewEvent[];
}): OrbitScanQualityPayload {
  const scanMetrics = args.scanEvents.map(scanMetricsFromEvent);
  const successful = scanMetrics.filter(
    (event) => event.eventType === "orbit.scan.completed"
  );
  const failedCount = scanMetrics.filter(
    (event) => event.eventType === "orbit.scan.failed"
  ).length;
  const recentScanCount = scanMetrics.length;
  const successfulScanCount = successful.length;
  const failureRate = rate(failedCount, recentScanCount);
  const recentRates = aggregateScanRates(successful);
  const { reviewedSuggestionCount, reviewUsefulRate } = reviewStats(
    args.reviewEvents ?? []
  );

  let recommendedProfile: OrbitScanBatchProfileId = QUICK_PROFILE;
  let profileReason = "Quick is safest until Orbit has enough scan history.";
  if (successfulScanCount >= 3) {
    const balancedReady =
      recentRates.modelAbstainRate <= 0.35 &&
      recentRates.usefulSuggestionRate >= 0.65 &&
      recentRates.medianDurationMs <= 45_000;
    if (balancedReady) {
      recommendedProfile = BALANCED_PROFILE;
      profileReason = "Recent scans are fast and useful enough for Balanced.";
    } else {
      profileReason = "Recent scan quality favors Quick for now.";
    }
  }

  const lastFiveSuccessful = successful.slice(0, 5);
  const deepRates = aggregateScanRates(lastFiveSuccessful);
  const largeSuccessfulScanCount = lastFiveSuccessful.filter(
    (event) => event.requestedCount >= 20
  ).length;
  const deepReason = deepLockReason({
    lastFiveSuccessfulCount: lastFiveSuccessful.length,
    largeSuccessfulScanCount,
    usefulSuggestionRate: deepRates.usefulSuggestionRate,
    modelAbstainRate: deepRates.modelAbstainRate,
    failureRate,
    medianDurationMs: deepRates.medianDurationMs,
    reviewedSuggestionCount,
    reviewUsefulRate,
  });
  const deepUnlocked = deepReason === "Deep batches are available.";

  return {
    recommendedProfile,
    profileReason,
    successfulScanCount,
    recentScanCount,
    largeSuccessfulScanCount,
    usefulSuggestionRate: recentRates.usefulSuggestionRate,
    modelAbstainRate: recentRates.modelAbstainRate,
    failureRate,
    medianDurationMs: recentRates.medianDurationMs,
    reviewedSuggestionCount,
    reviewUsefulRate,
    deep: {
      unlocked: deepUnlocked,
      reason: deepReason,
    },
  };
}
