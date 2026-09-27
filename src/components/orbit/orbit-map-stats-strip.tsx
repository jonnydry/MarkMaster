"use client";

import type { ReactNode } from "react";

import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import type { OrbitGraphStats } from "@/types";

interface OrbitMapStatsStripProps {
  stats: OrbitGraphStats;
  className?: string;
}

/**
 * The map's key and stats in one strip: each count sits next to the symbol
 * it's drawn with on the canvas, so there's no separate legend to open.
 */
export function OrbitMapStatsStrip({ stats, className }: OrbitMapStatsStripProps) {
  const collections = stats.userCollectionCount + stats.xFolderCount;
  const truncated = stats.renderedBookmarks < stats.totalBookmarks;

  return (
    <div
      role="group"
      aria-label="Map key"
      className={cn(
        orbitMapFloatingShellClass(),
        "pointer-events-none absolute bottom-4 left-3 z-20 flex max-w-[calc(100%-5.5rem)] items-center gap-3 overflow-hidden px-2.5 py-1.5 lg:left-4 lg:px-3 lg:py-2",
        className
      )}
    >
      <KeyItem glyph={<TagGlyph />} value={stats.tagCount} label="tags" />
      <KeyItem glyph={<CollectionGlyph />} value={collections} label="collections" />
      <KeyItem
        glyph={<QueueGlyph />}
        value={stats.looseBookmarks}
        label="in queue"
        title="Loose bookmarks waiting in the Orbit queue"
      />
      {truncated ? (
        <>
          <span className="hidden h-4 w-px shrink-0 bg-hairline-soft sm:block" />
          <span
            className="hidden shrink-0 whitespace-nowrap font-mono text-2xs tabular-nums text-muted-foreground sm:inline"
            title="The map draws the most recent bookmarks in each home. Expand a home's “+N” to see more."
          >
            {stats.renderedBookmarks.toLocaleString()} of{" "}
            {stats.totalBookmarks.toLocaleString()} shown
          </span>
        </>
      ) : null}
    </div>
  );
}

function KeyItem({
  glyph,
  value,
  label,
  title,
}: {
  glyph: ReactNode;
  value: number;
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
      title={title}
    >
      {glyph}
      <span className="font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function TagGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-muted-foreground" aria-hidden>
      <circle cx="6" cy="6" r="4.5" fill="currentColor" />
    </svg>
  );
}

function CollectionGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-muted-foreground" aria-hidden>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function QueueGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-primary" aria-hidden>
      <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
