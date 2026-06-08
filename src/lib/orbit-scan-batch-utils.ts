import { planOrbitScanBatch } from "@/lib/orbit-batch-planner";
import {
  ORBIT_SCAN_BATCH_PROFILES,
  type OrbitScanBatchMode,
  type OrbitScanBatchProfileId,
} from "@/lib/orbit-config";
import type { OrbitView } from "@/lib/orbit-navigation";
import type { OrbitScanBatchMetadata, OrbitScanQualityPayload } from "@/types";

export function buildOrbitScanContextKey(args: {
  orbitView: OrbitView;
  page: number;
  queryString: string;
  scanningSelection: boolean;
  scanTargetIds: string[];
  batchMode: OrbitScanBatchMode;
  batchProfile: OrbitScanBatchProfileId;
}): string {
  const sortedTargets = [...args.scanTargetIds].sort().join("|");
  return [
    args.orbitView,
    String(args.page),
    args.queryString,
    args.batchMode,
    args.batchProfile,
    args.scanningSelection ? `sel:${sortedTargets}` : "queue",
  ].join("::");
}

export function profileForCount(count: number): OrbitScanBatchProfileId {
  if (count <= ORBIT_SCAN_BATCH_PROFILES.quick.size) return "quick";
  if (count <= ORBIT_SCAN_BATCH_PROFILES.balanced.size) return "balanced";
  return "deep";
}

export function buildFallbackBatchMetadata(args: {
  targetIds: string[];
  mode: OrbitScanBatchMode;
  profile: OrbitScanBatchProfileId;
}): OrbitScanBatchMetadata {
  return {
    mode: args.mode,
    profile: args.profile,
    requestedCount: args.targetIds.length,
    candidatePoolCount: args.targetIds.length,
    sharedSignalCount: 0,
    sourceUnknownCount: 0,
    sourceUnknownRate: 0,
    selectedSourceUnknownCount: 0,
    selectedSourceUnknownRate: 0,
    usefulSignalCount: 0,
    selectionReason: "Scanned the provided bookmark IDs.",
  };
}

export function batchMetadataFromPlan(args: {
  plan: ReturnType<typeof planOrbitScanBatch>;
  mode: OrbitScanBatchMode;
  profile: OrbitScanBatchProfileId;
}): OrbitScanBatchMetadata {
  return {
    mode: args.mode,
    profile: args.profile,
    requestedCount: args.plan.bookmarkIds.length,
    candidatePoolCount: args.plan.candidateCount,
    sharedSignalCount: args.plan.sharedSignalCount,
    sourceUnknownCount: args.plan.sourceUnknownCount,
    sourceUnknownRate: args.plan.sourceUnknownRate,
    selectedSourceUnknownCount: args.plan.selectedSourceUnknownCount,
    selectedSourceUnknownRate: args.plan.selectedSourceUnknownRate,
    usefulSignalCount: args.plan.usefulSignalCount,
    selectionReason: args.plan.selectionReason,
  };
}

export function chooseAutoProfile(args: {
  quality: OrbitScanQualityPayload | undefined;
  sourceUnknownRate: number;
}): OrbitScanBatchProfileId {
  if (!args.quality || args.quality.successfulScanCount < 3) return "quick";
  if (args.sourceUnknownRate > 0.35) return "quick";
  return args.quality.recommendedProfile;
}
