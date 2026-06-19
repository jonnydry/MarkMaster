"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, Hash } from "lucide-react";

import { HighlightProgress } from "@/components/highlight-progress";
import type { AnalyticsData } from "@/types";
import { cn } from "@/lib/utils";

import {
  analyticsListSurfaceCardClass,
  analyticsListSurfaceClass,
} from "./analytics-primitives";
import {
  ChartShell,
  EmptyBox,
  SectionHeading,
  type ChartVariant,
} from "./analytics-chart-shell";

export const TagRankCard = React.memo(function TagRankCard({
  tags,
  variant = "card",
}: {
  tags: AnalyticsData["tagDistribution"];
  variant?: ChartVariant;
}) {
  const max = useMemo(() => tags.reduce((m, t) => Math.max(m, t.count), 0) || 1, [tags]);
  const listClass =
    variant === "flat" ? analyticsListSurfaceClass : analyticsListSurfaceCardClass;

  return (
    <ChartShell variant={variant}>
      <SectionHeading
        title="Most used tags"
        icon={<Hash className="h-4 w-4" />}
        meta={tags.length > 0 ? `${tags.length} tags` : undefined}
        variant={variant}
      />
      {tags.length === 0 ? (
        <EmptyBox />
      ) : (
        <ul className={listClass}>
          {tags.slice(0, 10).map((t) => {
            const share = (t.count / max) * 100;
            return (
              <li key={t.id}>
                <Link
                  href={`/dashboard?tag=${encodeURIComponent(t.id)}`}
                  className={cn(
                    "group grid grid-cols-[auto_minmax(0,1fr)_minmax(96px,38%)_auto_auto] items-center gap-3 rounded-sm px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                    "hover:bg-surface-1"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium">{t.tag}</span>
                  <HighlightProgress
                    className="w-full"
                    percent={share}
                    size="md"
                    durationClass="duration-500"
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t.count.toLocaleString()}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ChartShell>
  );
});
