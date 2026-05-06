"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrbitScanResponsePayload } from "@/types";

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

const STRATEGY_PREVIEW = 140;

interface OrbitScanOverviewStripProps {
  payload: OrbitScanResponsePayload;
  className?: string;
}

function StrategyLines({
  taggingStrategy,
  collectionStrategy,
}: {
  taggingStrategy: string;
  collectionStrategy: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const tagLong = taggingStrategy.length > STRATEGY_PREVIEW;
  const colLong = collectionStrategy.length > STRATEGY_PREVIEW;
  const needsToggle = tagLong || colLong;

  const tagDisplay =
    expanded || !tagLong
      ? taggingStrategy
      : `${taggingStrategy.slice(0, STRATEGY_PREVIEW)}…`;
  const colDisplay =
    expanded || !colLong
      ? collectionStrategy
      : `${collectionStrategy.slice(0, STRATEGY_PREVIEW)}…`;

  return (
    <div className="space-y-2">
      <div className="space-y-2 text-xs leading-relaxed text-white/60">
        <p>
          <span className="text-white/45" style={MONO_STYLE}>
            Tagging
          </span>{" "}
          {tagDisplay}
        </p>
        <p>
          <span className="text-white/45" style={MONO_STYLE}>
            Collections
          </span>{" "}
          {colDisplay}
        </p>
      </div>
      {needsToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-sky-200 hover:bg-white/5 hover:text-sky-100"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

export function OrbitScanOverviewStrip({
  payload,
  className,
}: OrbitScanOverviewStripProps) {
  const [open, setOpen] = useState(true);

  const modelLine = useMemo(() => {
    const z = payload.privacy.zeroDataRetention;
    const zdr =
      z === true ? " · Zero data retention" : z === false ? "" : "";
    return `Model ${payload.model}${zdr}`;
  }, [payload.model, payload.privacy.zeroDataRetention]);

  const { summary, tagRollups, collectionRollups, plan } = payload;
  const { overview } = plan;

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(10,15,29,0.55),rgba(15,23,42,0.72))] shadow-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left sm:px-5"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-sky-200/90" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-sky-200/90" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80"
            style={MONO_STYLE}
          >
            Grok pass overview
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-white/90">
            {overview.summary}
          </p>
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-1 sm:px-5">
          <p className="text-xs text-white/55" style={MONO_STYLE}>
            {summary.bookmarkCount} bookmark
            {summary.bookmarkCount === 1 ? "" : "s"} suggested ·{" "}
            {summary.bookmarksWithTags} with tags ·{" "}
            {summary.bookmarksWithCollections} collection
            {summary.bookmarksWithCollections === 1 ? "" : "s"}
            <span className="text-white/35"> · {modelLine}</span>
          </p>

          <StrategyLines
            taggingStrategy={overview.taggingStrategy}
            collectionStrategy={overview.collectionStrategy}
          />

          {tagRollups.length > 0 ? (
            <div>
              <p
                className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45"
                style={MONO_STYLE}
              >
                Tags this pass
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tagRollups.map((tag) => (
                  <span
                    key={tag.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] text-white/80"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                    <span>{tag.name}</span>
                    <span className="tabular-nums text-white/45">
                      ×{tag.count}
                    </span>
                    {tag.reuseExisting ? (
                      <span className="text-[9px] uppercase tracking-wider text-emerald-300/80">
                        lib
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wider text-amber-200/80">
                        new
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {collectionRollups.length > 0 ? (
            <div>
              <p
                className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45"
                style={MONO_STYLE}
              >
                Collections this pass
              </p>
              <div className="flex flex-wrap gap-1.5">
                {collectionRollups.map((col) => (
                  <span
                    key={col.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] text-white/80"
                  >
                    <span>{col.name}</span>
                    <span className="tabular-nums text-white/45">
                      ×{col.count}
                    </span>
                    {col.reuseExisting ? (
                      <span className="text-[9px] uppercase tracking-wider text-emerald-300/80">
                        lib
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wider text-amber-200/80">
                        new
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
