"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Tags } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrbitScanResponsePayload } from "@/types";

import { useOrbitalTheme } from "@/components/providers";
import {
  orbitDataClass,
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMetaMuted,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";

const STRATEGY_PREVIEW = 140;

interface OrbitScanOverviewStripProps {
  payload: OrbitScanResponsePayload;
  className?: string;
}

type TagRollup = OrbitScanResponsePayload["tagRollups"][number];
type CollectionRollup = OrbitScanResponsePayload["collectionRollups"][number];

function OverviewMetric({
  value,
  label,
  isOrbital,
}: {
  value: ReactNode;
  label: string;
  isOrbital: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div
        className={cn(
          orbitDataClass(isOrbital),
          "text-base font-semibold leading-none text-foreground"
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          orbitLabelClass(isOrbital),
          "mt-1 text-[9px]",
          orbitMetaMuted(isOrbital)
        )}
      >
        {label}
      </div>
    </div>
  );
}

function SourceBadge({
  reuseExisting,
  isOrbital,
}: {
  reuseExisting: boolean;
  isOrbital: boolean;
}) {
  return (
    <span
      className={cn(
        orbitLabelClass(isOrbital),
        "rounded-sm border px-1.5 py-0.5 text-[8px]",
        reuseExisting
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-500 dark:text-emerald-300"
          : "border-primary/25 bg-primary/10 text-primary/80"
      )}
    >
      {reuseExisting ? "Lib" : "New"}
    </span>
  );
}

function TagRollupChip({
  tag,
  isOrbital,
}: {
  tag: TagRollup;
  isOrbital: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-sm border border-hairline-soft bg-surface-2/70 px-2 text-[11px] text-foreground/85",
        !isOrbital && "dark:border-white/12 dark:bg-white/[0.045] dark:text-white/80"
      )}
    >
      <span
        className="size-2 shrink-0 rounded-sm"
        style={{ backgroundColor: tag.color }}
        aria-hidden
      />
      <span className="min-w-0 max-w-[13rem] truncate">{tag.name}</span>
      <span
        className={cn(
          orbitDataClass(isOrbital),
          "shrink-0 text-[10px]",
          orbitMetaSoft(isOrbital)
        )}
      >
        x{tag.count}
      </span>
      <SourceBadge reuseExisting={tag.reuseExisting} isOrbital={isOrbital} />
    </span>
  );
}

function CollectionRollupChip({
  collection,
  isOrbital,
}: {
  collection: CollectionRollup;
  isOrbital: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-sm border border-hairline-soft bg-surface-2/70 px-2 text-[11px] text-foreground/85",
        !isOrbital && "dark:border-white/12 dark:bg-white/[0.045] dark:text-white/80"
      )}
    >
      <span className="min-w-0 max-w-[13rem] truncate">{collection.name}</span>
      <span
        className={cn(
          orbitDataClass(isOrbital),
          "shrink-0 text-[10px]",
          orbitMetaSoft(isOrbital)
        )}
      >
        x{collection.count}
      </span>
      <SourceBadge
        reuseExisting={collection.reuseExisting}
        isOrbital={isOrbital}
      />
    </span>
  );
}

function RollupSection({
  title,
  icon,
  count,
  children,
  isOrbital,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  children: ReactNode;
  isOrbital: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </span>
        <span className={cn(orbitLabelClass(isOrbital), "text-primary/75")}>
          {title}
        </span>
        <span
          className={cn(
            orbitDataClass(isOrbital),
            "rounded-sm border border-hairline-soft bg-surface-2/60 px-1.5 py-0.5 text-[10px]",
            orbitMetaSoft(isOrbital)
          )}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function StrategyLines({
  taggingStrategy,
  collectionStrategy,
  isOrbital,
}: {
  taggingStrategy: string;
  collectionStrategy: string;
  isOrbital: boolean;
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

  const lineClass = cn(
    "grid gap-1 rounded-sm border border-hairline-soft bg-surface-2/45 px-3 py-2 text-xs leading-relaxed sm:grid-cols-[7rem_minmax(0,1fr)]",
    isOrbital
      ? "text-muted-foreground"
      : "text-muted-foreground dark:border-white/10 dark:bg-white/[0.035] dark:text-white/60"
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <p className={lineClass}>
          <span className={orbitLabelClass(isOrbital, orbitMetaMuted(isOrbital))}>
            Tagging
          </span>
          <span>{tagDisplay}</span>
        </p>
        <p className={lineClass}>
          <span className={orbitLabelClass(isOrbital, orbitMetaMuted(isOrbital))}>
            Collections
          </span>
          <span>{colDisplay}</span>
        </p>
      </div>
      {needsToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-sm px-2 text-[11px] text-primary/80 hover:bg-primary/5 hover:text-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

function defaultOverviewOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 640px)").matches;
}

export function OrbitScanOverviewStrip({
  payload,
  className,
}: OrbitScanOverviewStripProps) {
  const { isOrbital } = useOrbitalTheme();
  const [open, setOpen] = useState(defaultOverviewOpen);

  const modelLine = useMemo(() => {
    const z = payload.privacy.zeroDataRetention;
    const zdr =
      z === true ? " · Zero data retention" : z === false ? "" : "";
    return `Model ${payload.model}${zdr}`;
  }, [payload.model, payload.privacy.zeroDataRetention]);
  const zeroDataRetention = payload.privacy.zeroDataRetention === true;

  const { summary, tagRollups, collectionRollups, plan } = payload;
  const { overview } = plan;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-sm border",
        orbitHairlineBorder(isOrbital),
        isOrbital ? "glass-orbital" : "bg-surface-2/70 dark:bg-white/[0.035]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3 text-left transition-colors hover:bg-primary/5 sm:px-4"
        aria-expanded={open}
      >
        <span className="mt-0.5 flex size-7 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
          {open ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <GrokMark className="size-4 text-primary" title="Grok" />
            <span className={cn(orbitLabelClass(isOrbital), "text-primary/75")}>
              Grok pass
            </span>
            <span
              className={cn(
                orbitDataClass(isOrbital),
                "rounded-sm border border-hairline-soft bg-surface-2/60 px-1.5 py-0.5 text-[10px]",
                orbitMetaSoft(isOrbital)
              )}
            >
              {payload.model}
            </span>
            {zeroDataRetention ? (
              <span className="rounded-sm border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-500 dark:text-emerald-300">
                ZDR
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-1 text-sm font-medium leading-5 text-foreground/90 dark:text-white/90",
              !open && "truncate"
            )}
          >
            {open ? overview.summary : `Grok plan · ${modelLine}`}
          </p>
        </div>
      </button>

      {open ? (
        <div className="border-t border-hairline-soft">
          <div className="grid grid-cols-3 divide-x divide-hairline-soft bg-surface-1/35">
            <OverviewMetric
              value={summary.bookmarkCount}
              label="suggested"
              isOrbital={isOrbital}
            />
            <OverviewMetric
              value={summary.bookmarksWithTags}
              label="tagged"
              isOrbital={isOrbital}
            />
            <OverviewMetric
              value={summary.bookmarksWithCollections}
              label="collected"
              isOrbital={isOrbital}
            />
          </div>

          <div className="space-y-4 px-3 pb-3 pt-3 sm:px-4">
            <StrategyLines
              taggingStrategy={overview.taggingStrategy}
              collectionStrategy={overview.collectionStrategy}
              isOrbital={isOrbital}
            />

            {tagRollups.length > 0 ? (
              <RollupSection
                title="Tags"
                icon={<Tags className="size-3.5" aria-hidden />}
                count={tagRollups.length}
                isOrbital={isOrbital}
              >
                {tagRollups.map((tag) => (
                  <TagRollupChip
                    key={tag.name}
                    tag={tag}
                    isOrbital={isOrbital}
                  />
                ))}
              </RollupSection>
            ) : null}

            {collectionRollups.length > 0 ? (
              <RollupSection
                title="Collections"
                icon={<FolderOpen className="size-3.5" aria-hidden />}
                count={collectionRollups.length}
                isOrbital={isOrbital}
              >
                {collectionRollups.map((col) => (
                  <CollectionRollupChip
                    key={col.name}
                    collection={col}
                    isOrbital={isOrbital}
                  />
                ))}
              </RollupSection>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
