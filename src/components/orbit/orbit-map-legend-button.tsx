"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrbitalTheme } from "@/components/providers";
import {
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMetaMuted,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

interface OrbitMapLegendButtonProps {
  className?: string;
}

export function OrbitMapLegendButton({ className }: OrbitMapLegendButtonProps) {
  const { isOrbital } = useOrbitalTheme();

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Graph legend"
        className={cn(
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border bg-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          orbitHairlineBorder(isOrbital),
          className
        )}
      >
        <Info className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Legend</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <div>
          <p className={cn(orbitLabelClass(isOrbital), orbitMetaSoft(isOrbital))}>
            Legend
          </p>
          <ul className={cn("mt-3 space-y-3 text-sm", orbitMetaMuted(isOrbital))}>
            <li className="flex items-center gap-3">
              <span
                className="inline-block size-3 rounded-full border border-[#bfdbfe]/80 bg-[#2f6fed] shadow-[0_0_0_3px_rgba(47,111,237,0.12)]"
                aria-hidden="true"
              />
              <span>Loose bookmark</span>
            </li>
            <li className="flex items-center gap-3">
              <span
                className="inline-block size-3 rounded-full border border-[#a3a3a3]/70 bg-[#737373]"
                aria-hidden="true"
              />
              <span>Assigned bookmark</span>
            </li>
            <li className="flex items-center gap-3">
              <span
                className="relative inline-flex size-5 items-center justify-center rounded-full border-2 border-[#34d399]/80 bg-[#34d399]/12"
                aria-hidden="true"
              >
                <span className="size-2 rounded-full bg-[#a78bfa]" />
              </span>
              <span>Tag / collection hub</span>
            </li>
            <li className="flex items-center gap-3">
              <span
                className="h-px w-7 bg-muted-foreground/55"
                aria-hidden="true"
              />
              <span>Relationship</span>
            </li>
          </ul>
        </div>
        <p className={cn("border-t border-hairline-soft pt-2 text-[10px]", orbitMetaMuted(isOrbital))}>
          Scroll to zoom · drag to pan · click to focus · Esc to clear
        </p>
      </PopoverContent>
    </Popover>
  );
}
