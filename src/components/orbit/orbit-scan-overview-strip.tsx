"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BadgeCheck,
  ChevronDown,
  FolderOpen,
  ListChecks,
  Loader2,
  Tags,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrbitScanResponsePayload } from "@/types";

import {
  orbitDataClass,
  orbitLabelClass,
  orbitMetaMuted,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";

const STRATEGY_PREVIEW = 140;

interface OrbitScanOverviewStripProps {
  payload: OrbitScanResponsePayload;
  suggestionCount: number;
  scanning: boolean;
  applyingBatch: boolean;
  canApplyStrongMatches: boolean;
  onReview: () => void;
  onApplyStrongMatches: () => void;
  className?: string;
}

type TagRollup = OrbitScanResponsePayload["tagRollups"][number];
type CollectionRollup = OrbitScanResponsePayload["collectionRollups"][number];

function OverviewMetric({
  value,
  label}: {
  value: ReactNode;
  label: string;

}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div
        className={cn(
          orbitDataClass(),
          "text-base font-semibold leading-none text-foreground"
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          orbitLabelClass(),
          "mt-1 text-2xs",
          orbitMetaMuted()
        )}
      >
        {label}
      </div>
    </div>
  );
}

function SourceBadge({
  reuseExisting}: {
  reuseExisting: boolean;

}) {
  return (
    <span
      className={cn(
        orbitLabelClass(),
        "rounded-sm border px-1.5 py-0.5 text-2xs",
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
  tag}: {
  tag: TagRollup;

}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 surface-inset-strong px-2 text-xs text-foreground/85",
        "dark:border-white/12 dark:bg-white/[0.045] dark:text-white/80"
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
          orbitDataClass(),
          "shrink-0 text-2xs",
          orbitMetaSoft()
        )}
      >
        x{tag.count}
      </span>
      <SourceBadge reuseExisting={tag.reuseExisting}  />
    </span>
  );
}

function CollectionRollupChip({
  collection}: {
  collection: CollectionRollup;

}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 surface-inset-strong px-2 text-xs text-foreground/85",
        "dark:border-white/12 dark:bg-white/[0.045] dark:text-white/80"
      )}
    >
      <span className="min-w-0 max-w-[13rem] truncate">{collection.name}</span>
      <span
        className={cn(
          orbitDataClass(),
          "shrink-0 text-2xs",
          orbitMetaSoft()
        )}
      >
        x{collection.count}
      </span>
      <SourceBadge
        reuseExisting={collection.reuseExisting}

      />
    </span>
  );
}

function RollupSection({
  title,
  icon,
  count,
  children}: {
  title: string;
  icon: ReactNode;
  count: number;
  children: ReactNode;

}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </span>
        <span className={cn(orbitLabelClass(), "text-primary/75")}>
          {title}
        </span>
        <span
          className={cn(
            orbitDataClass(),
            "surface-inset-strong px-1.5 py-0.5 text-2xs",
            orbitMetaSoft()
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
  collectionStrategy}: {
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

  const lineClass = cn(
    "grid gap-1 surface-inset px-3 py-2 text-xs leading-relaxed sm:grid-cols-[7rem_minmax(0,1fr)]",
    "text-muted-foreground dark:border-white/10 dark:bg-white/[0.035] dark:text-white/60"
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <p className={lineClass}>
          <span className={orbitLabelClass(orbitMetaMuted())}>
            Tagging
          </span>
          <span>{tagDisplay}</span>
        </p>
        <p className={lineClass}>
          <span className={orbitLabelClass(orbitMetaMuted())}>
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
          className="h-7 rounded-sm px-2 text-xs text-primary/80 hover:bg-primary/5 hover:text-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

function subscribeWide(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(min-width: 640px)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getWideSnapshot() {
  return (
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
}

export function OrbitScanOverviewStrip({
  payload,
  suggestionCount,
  scanning,
  applyingBatch,
  canApplyStrongMatches,
  onReview,
  onApplyStrongMatches,
  className}: OrbitScanOverviewStripProps) {
  const prefersWide = useSyncExternalStore(
    subscribeWide,
    getWideSnapshot,
    () => false
  );
  const [userToggle, setUserToggle] = useState<boolean | null>(null);
  const open = userToggle ?? prefersWide;

  const modelLine = useMemo(() => {
    const z = payload.privacy.zeroDataRetention;
    const zdr =
      z === true ? " · Zero data retention" : z === false ? "" : "";
    return `Model ${payload.model}${zdr}`;
  }, [payload.model, payload.privacy.zeroDataRetention]);
  const zeroDataRetention = payload.privacy.zeroDataRetention === true;

  const { summary, tagRollups, collectionRollups, plan } = payload;
  const { overview } = plan;
  const reviewLabel =
    suggestionCount === 1
      ? "Review 1 suggestion"
      : `Review ${suggestionCount.toLocaleString()} suggestions`;

  return (
    <section
      className={cn(
        "surface-inset-strong overflow-hidden",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setUserToggle(!open)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3 text-left transition-colors hover:bg-primary/5 sm:px-4"
        aria-expanded={open}
      >
        <span className="mt-0.5 flex size-7 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 text-primary">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform motion-reduce:transition-none",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <GrokMark className="size-4 text-primary" title="Grok" />
            <span className={cn(orbitLabelClass(), "text-primary/75")}>
              Grok pass
            </span>
            <span
              className={cn(
                orbitDataClass(),
                "surface-inset-strong px-1.5 py-0.5 text-2xs",
                orbitMetaSoft()
              )}
            >
              {payload.model}
            </span>
            {zeroDataRetention ? (
              <span className="rounded-sm border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-emerald-500 dark:text-emerald-300">
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

      {suggestionCount > 0 ? (
        <div className="flex flex-col gap-3 border-t border-hairline-soft bg-surface-1/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="min-w-0">
            <p className={cn(orbitLabelClass(), "text-foreground/80")}>
              Next step
            </p>
            <p className={cn("mt-0.5 text-xs", orbitMetaMuted())}>
              Review each suggestion, or apply only high-confidence matches.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="order-2 h-9 gap-1.5 border-emerald-400/25 bg-emerald-400/10 text-emerald-700 hover:border-emerald-400/45 hover:bg-emerald-400/15 sm:order-1 dark:text-emerald-100"
              disabled={scanning || applyingBatch || !canApplyStrongMatches}
              onClick={onApplyStrongMatches}
            >
              {applyingBatch ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <BadgeCheck className="size-3.5" aria-hidden />
              )}
              Apply strong matches
            </Button>
            <Button
              type="button"
              size="sm"
              className="order-1 h-9 gap-1.5 sm:order-2"
              disabled={scanning || applyingBatch}
              onClick={onReview}
            >
              <ListChecks className="size-3.5" aria-hidden />
              {reviewLabel}
            </Button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="animate-in fade-in-0 slide-in-from-top-2 border-t border-hairline-soft">
          <div className="grid grid-cols-3 divide-x divide-hairline-soft bg-surface-1/35">
            <OverviewMetric
              value={summary.bookmarkCount}
              label="suggested"

            />
            <OverviewMetric
              value={summary.bookmarksWithTags}
              label="tagged"

            />
            <OverviewMetric
              value={summary.bookmarksWithCollections}
              label="collected"

            />
          </div>

          <div className="space-y-4 px-3 pb-3 pt-3 sm:px-4">
            <StrategyLines
              taggingStrategy={overview.taggingStrategy}
              collectionStrategy={overview.collectionStrategy}

            />

            {tagRollups.length > 0 ? (
              <RollupSection
                title="Tags"
                icon={<Tags className="size-3.5" aria-hidden />}
                count={tagRollups.length}

              >
                {tagRollups.map((tag) => (
                  <TagRollupChip
                    key={tag.name}
                    tag={tag}

                  />
                ))}
              </RollupSection>
            ) : null}

            {collectionRollups.length > 0 ? (
              <RollupSection
                title="Collections"
                icon={<FolderOpen className="size-3.5" aria-hidden />}
                count={collectionRollups.length}

              >
                {collectionRollups.map((col) => (
                  <CollectionRollupChip
                    key={col.name}
                    collection={col}

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
