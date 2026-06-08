import "server-only";

import type { OrbitBookmarkForScan, OrbitCollectionContext, OrbitTagContext } from "@/lib/orbit-grok";
import { extractOrbitBookmarkSignals } from "@/lib/orbit-signal-extraction";

export interface OrbitScanSignalQuality {
  richCount: number;
  sparseCount: number;
}

function isRichDataQuality(
  dataQuality: ReturnType<typeof extractOrbitBookmarkSignals>["dataQuality"]
) {
  return Object.values(dataQuality).some(Boolean);
}

export function computeOrbitScanSignalQuality(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
}): OrbitScanSignalQuality {
  let richCount = 0;
  let sparseCount = 0;

  for (const bookmark of args.bookmarks) {
    const signals = extractOrbitBookmarkSignals({
      bookmark,
      existingTags: args.existingTags,
      existingCollections: args.existingCollections,
      tweetId: bookmark.tweetId,
    });

    if (isRichDataQuality(signals.dataQuality)) {
      richCount += 1;
    } else {
      sparseCount += 1;
    }
  }

  return { richCount, sparseCount };
}