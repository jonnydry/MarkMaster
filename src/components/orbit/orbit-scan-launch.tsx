"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import {
  OrbitBatchMenu,
  type OrbitLibraryTagOption,
} from "@/components/orbit/orbit-batch-menu";
import { cn } from "@/lib/utils";

export interface OrbitScanLaunchProps {
  label: string;
  busy: boolean;
  disabled: boolean;
  hasPlan: boolean;
  onScan: () => void;
  library?: OrbitLibraryTagOption;
}

/**
 * Full-width scan control for the Orbit feed column. The glow rail is the
 * page's light source, so the action reads as the instrument rather than a
 * toolbar chip.
 */
export function OrbitScanLaunch({
  label,
  busy,
  disabled,
  hasPlan,
  onScan,
  library,
}: OrbitScanLaunchProps) {
  return (
    <div
      className={cn(
        "flex h-11 w-full items-stretch overflow-hidden rounded-sm border border-hairline-strong bg-background state-selected",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/45"
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 text-left text-sm font-semibold text-foreground outline-none hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        aria-busy={busy}
        onClick={onScan}
      >
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : hasPlan ? (
          <RefreshCw className="size-4 shrink-0" />
        ) : (
          <OrbitLogoMark className="size-4" />
        )}
        <span className="truncate">{label}</span>
      </button>
      <div className="flex shrink-0 items-stretch border-l border-hairline-soft">
        <OrbitBatchMenu
          disabled={busy}
          library={library}
          triggerClassName="h-full rounded-none border-0 bg-transparent px-3 text-sm hover:border-transparent hover:bg-hover"
        />
      </div>
    </div>
  );
}
