"use client";

import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  orbitLabelClass,
  orbitMetaMuted,
  orbitMetaSoft} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

interface OrbitMapLegendButtonProps {
  className?: string;
}

export function OrbitMapLegendButton({ className }: OrbitMapLegendButtonProps) {

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Graph legend"
        className={cn(
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border border-hairline-strong bg-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
          className
        )}
      >
        <Info className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Legend</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <div>
          <p className={cn(orbitLabelClass(), orbitMetaSoft())}>
            Legend
          </p>
          <ul className={cn("mt-3 space-y-3 text-sm", orbitMetaMuted())}>
            <li className="flex items-center gap-3">
              <span
                className="inline-block size-3 rounded-full bg-primary"
                aria-hidden="true"
              />
              <span>Loose bookmark</span>
            </li>
            <li className="flex items-center gap-3">
              <span
                className="inline-block size-3 rounded-full bg-muted-foreground/70"
                aria-hidden="true"
              />
              <span>Assigned bookmark</span>
            </li>
            <li className="flex items-center gap-3">
              <span
                className="relative inline-flex size-5 items-center justify-center rounded-sm border border-hairline-strong bg-primary/10"
                aria-hidden="true"
              >
                <span className="size-2 rounded-full bg-foreground/70" />
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
            <li className="flex items-center gap-3">
              <span className="text-2xs font-medium text-muted-foreground">
                +N
              </span>
              <span>More bookmarks hidden by the map cap</span>
            </li>
          </ul>
        </div>
        <p className={cn("border-t border-hairline-soft pt-2 text-2xs", orbitMetaMuted())}>
          Scroll to zoom · drag to pan · click to inspect · drag a bookmark onto
          a hub to assign · double-click a bookmark to open · Esc to clear ·
          Motion keeps hubs drifting
        </p>
      </PopoverContent>
    </Popover>
  );
}
