"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getDislikedHighlightIds,
  getLikedHighlightIds,
} from "@/lib/highlight-feedback";

/** Re-read liked/disliked highlight IDs when inline Discovery feedback changes. */
export function useHighlightFeedbackIds() {
  const [feedbackVersion, setFeedbackVersion] = useState(0);

  useEffect(() => {
    const onFeedback = () => setFeedbackVersion((v) => v + 1);
    window.addEventListener("markmaster:highlight-feedback-changed", onFeedback);
    return () =>
      window.removeEventListener("markmaster:highlight-feedback-changed", onFeedback);
  }, []);

  return useMemo(
    () => ({
      dislikedIds: getDislikedHighlightIds(),
      likedIds: getLikedHighlightIds(),
      feedbackVersion,
    }),
    [feedbackVersion]
  );
}
