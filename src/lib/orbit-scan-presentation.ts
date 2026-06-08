import type { ElementType } from "react";
import { AlertTriangle, Gauge, KeyRound } from "lucide-react";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import type { OrbitScanFailure } from "@/hooks/use-orbit-scan";

export function formatRetryAfter(seconds: number | undefined) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

export function getScanFailurePresentation(error: OrbitScanFailure): {
  Icon: ElementType<{ className?: string }>;
  label: string;
  badgeClassName: string;
  panelClassName: string;
  iconClassName: string;
  helper: string;
} {
  const retryAfter = formatRetryAfter(error.retryAfterSeconds);

  switch (error.kind) {
    case "auth":
      return {
        Icon: KeyRound,
        label: "Auth",
        badgeClassName: "border-amber-300/30 bg-amber-300/10 text-amber-100",
        panelClassName: "border-amber-300/25 bg-amber-300/10",
        iconClassName: "text-amber-200",
        helper: "Check the server xAI key and model access, then retry.",
      };
    case "model":
      return {
        Icon: OrbitLogoMark,
        label: "Model",
        badgeClassName: "border-primary/30 bg-primary/10 text-primary",
        panelClassName: "border-primary/25 bg-primary/10",
        iconClassName: "text-primary",
        helper: "Update XAI_ORBIT_MODEL or enable the configured model for this key.",
      };
    case "rate-limit":
      return {
        Icon: Gauge,
        label: "Rate limit",
        badgeClassName: "border-orange-300/30 bg-orange-300/10 text-orange-100",
        panelClassName: "border-orange-300/25 bg-orange-300/10",
        iconClassName: "text-orange-200",
        helper: retryAfter
          ? `xAI asked MarkMaster to wait about ${retryAfter}. A smaller selected pass may clear sooner.`
          : "xAI asked MarkMaster to slow down. A smaller selected pass may clear sooner.",
      };
    case "request":
      return {
        Icon: AlertTriangle,
        label: "Request",
        badgeClassName:
          "border-hairline-soft bg-surface-2/80 text-foreground/80 dark:border-white/20 dark:bg-white/[0.08] dark:text-white/80",
        panelClassName:
          "border-hairline-soft bg-surface-2/60 dark:border-white/14 dark:bg-white/[0.055]",
        iconClassName: "text-muted-foreground dark:text-white/75",
        helper: "Refresh the page scope or scan a selected subset.",
      };
    case "provider":
    case "unknown":
    default:
      return {
        Icon: AlertTriangle,
        label: "Provider",
        badgeClassName: "border-rose-300/30 bg-rose-300/10 text-rose-100",
        panelClassName: "border-rose-300/25 bg-rose-300/10",
        iconClassName: "text-rose-200",
        helper: "Retry the pass, or scan a smaller selected set while xAI recovers.",
      };
  }
}
