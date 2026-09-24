"use client";

import { useState, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, ListChecks, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrbitScanResponsePayload } from "@/types";
import { TagDot } from "@/components/tag-dot";

import { orbitDataClass, orbitLabelClass } from "@/lib/orbit-route-chrome";

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

/** Subtle marker for names the scan would create (vs. reuse from the library). */
function NewMarker() {
  return <span className="shrink-0 text-xs text-primary">new</span>;
}

function RollupItem({ item, dot }: { item: TagRollup | CollectionRollup; dot?: ReactNode }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 text-xs text-foreground">
      {dot}
      <span className="min-w-0 max-w-[13rem] truncate">{item.name}</span>
      <span className={cn(orbitDataClass(), "shrink-0 text-muted-foreground")}>
        {item.count}
      </span>
      {item.reuseExisting ? null : <NewMarker />}
    </li>
  );
}

function RollupSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className={orbitLabelClass()}>
        {title} <span className={orbitDataClass()}>{count}</span>
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">{children}</ul>
    </div>
  );
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

  const lineClass =
    "grid gap-1 text-xs leading-relaxed text-muted-foreground sm:grid-cols-[7rem_minmax(0,1fr)]";

  return (
    <div className="space-y-1.5">
      <p className={lineClass}>
        <span className={orbitLabelClass()}>Tagging</span>
        <span>{tagDisplay}</span>
      </p>
      <p className={lineClass}>
        <span className={orbitLabelClass()}>Collections</span>
        <span>{colDisplay}</span>
      </p>
      {needsToggle ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="px-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function OrbitScanOverviewStrip({
  payload,
  suggestionCount,
  scanning,
  applyingBatch,
  canApplyStrongMatches,
  onReview,
  onApplyStrongMatches,
  className,
}: OrbitScanOverviewStripProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { summary, tagRollups, collectionRollups, plan } = payload;
  const { overview } = plan;
  const zeroDataRetention = payload.privacy.zeroDataRetention === true;
  const reusedTagCount = tagRollups.filter((tag) => tag.reuseExisting).length;
  const newTagCount = tagRollups.length - reusedTagCount;

  // Outcome language for the hybrid breakdown (Consistency-H1 / UX-H3):
  // hidden when nothing was left over; raw engine metrics stay in the
  // tooltip for power users.
  const hybrid = payload.batch.hybrid;
  const hasHybridActivity = Boolean(
    hybrid &&
      (hybrid.firstPassLeftovers > 0 ||
        hybrid.recoveredOnRefine > 0 ||
        hybrid.escalatedToGrok > 0)
  );
  const hybridOutcomeLine =
    hybrid && hasHybridActivity
      ? `Couldn't match: ${hybrid.firstPassLeftovers} · Fixed on retry: ${hybrid.recoveredOnRefine} · Sent to Grok for new names: ${hybrid.escalatedToGrok}`
      : null;
  const hybridEngineDetail = hybrid
    ? `Jev leftovers ${hybrid.firstPassLeftovers} · recovered ${hybrid.recoveredOnRefine} · Grok escalations ${hybrid.escalatedToGrok}`
    : null;
  const reviewLabel =
    suggestionCount === 1
      ? "Review 1 suggestion"
      : `Review ${suggestionCount.toLocaleString()} suggestions`;

  const headline =
    suggestionCount > 0
      ? plural(suggestionCount, "suggestion", "suggestions")
      : "All suggestions resolved";
  const detailParts = [
    reusedTagCount > 0 ? `${reusedTagCount.toLocaleString()} reuse your tags` : null,
    newTagCount > 0 ? plural(newTagCount, "new tag", "new tags") : null,
    summary.bookmarksWithCollections > 0
      ? `${summary.bookmarksWithCollections.toLocaleString()} to collections`
      : null,
  ].filter(Boolean);

  return (
    <section
      aria-label="Scan results"
      className={cn("border-y border-hairline-soft", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-foreground">{headline}</span>
          {detailParts.length > 0 ? (
            <span className="text-muted-foreground">
              {" · "}
              {detailParts.join(" · ")}
            </span>
          ) : null}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((v) => !v)}
          >
            Details
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform motion-reduce:transition-none",
                detailsOpen ? "rotate-180" : "rotate-0"
              )}
              aria-hidden
            />
          </Button>
          {suggestionCount > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
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
                className="gap-1.5"
                disabled={scanning || applyingBatch}
                onClick={onReview}
              >
                <ListChecks className="size-3.5" aria-hidden />
                {reviewLabel}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {detailsOpen ? (
        <div className="space-y-4 border-t border-hairline-soft py-3">
          {overview.summary ? (
            <p className="text-sm leading-relaxed text-foreground">
              {overview.summary}
            </p>
          ) : null}

          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Suggested</dt>
              <dd className={cn(orbitDataClass(), "text-xs text-foreground")}>
                {summary.bookmarkCount}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Tagged</dt>
              <dd className={cn(orbitDataClass(), "text-xs text-foreground")}>
                {summary.bookmarksWithTags}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Collected</dt>
              <dd className={cn(orbitDataClass(), "text-xs text-foreground")}>
                {summary.bookmarksWithCollections}
              </dd>
            </div>
          </dl>

          {tagRollups.length > 0 ? (
            <RollupSection title="Tags" count={tagRollups.length}>
              {tagRollups.map((tag) => (
                <RollupItem
                  key={tag.name}
                  item={tag}
                  dot={<TagDot name={tag.name} color={tag.color} size={8} />}
                />
              ))}
            </RollupSection>
          ) : null}

          {collectionRollups.length > 0 ? (
            <RollupSection title="Collections" count={collectionRollups.length}>
              {collectionRollups.map((col) => (
                <RollupItem key={col.name} item={col} />
              ))}
            </RollupSection>
          ) : null}

          <StrategyLines
            taggingStrategy={overview.taggingStrategy}
            collectionStrategy={overview.collectionStrategy}
          />

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {payload.batch.hybrid ? "Orbit pass" : "Grok pass"}
              {" · "}
              <span className={orbitDataClass()}>{payload.model}</span>
              {zeroDataRetention ? " · Zero data retention" : null}
            </p>
            {hybridOutcomeLine ? (
              <p title={hybridEngineDetail ?? undefined}>{hybridOutcomeLine}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
