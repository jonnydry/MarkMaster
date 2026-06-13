import { toast } from "sonner";

import { formatAppliedToast } from "@/lib/orbit-apply-utils";
import type { OrbitApplyResult, OrbitBookmarkDecision } from "@/types";

export async function applyPrimarySuggestion(args: {
  bookmarkId: string;
  getDecision: (id: string) => OrbitBookmarkDecision | null;
  applySuggestion: (
    id: string,
    variant: "primary"
  ) => Promise<OrbitApplyResult | null>;
  onApplied: (bookmarkId: string) => void;
  onOpenReview: (bookmarkId: string) => void;
}): Promise<void> {
  const decision = args.getDecision(args.bookmarkId);
  if (!decision?.primary) {
    args.onOpenReview(args.bookmarkId);
    return;
  }

  try {
    const applied = await args.applySuggestion(args.bookmarkId, "primary");
    if (applied) {
      args.onApplied(args.bookmarkId);
      toast.success(`Applied · ${formatAppliedToast(applied)}`);
    }
  } catch {
    args.onOpenReview(args.bookmarkId);
  }
}
