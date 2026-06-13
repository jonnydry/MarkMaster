"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BadgeCheck, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export const TopVoicesCard = React.memo(function TopVoicesCard({
  authors,
  totalBookmarks,
  variant = "card",
}: {
  authors: AnalyticsData["topAuthors"];
  totalBookmarks: number;
  variant?: ChartVariant;
}) {
  const max = useMemo(() => authors.reduce((m, a) => Math.max(m, a.count), 0) || 1, [authors]);
  const topShare = useMemo(
    () =>
      totalBookmarks > 0
        ? (authors.slice(0, 3).reduce((s, a) => s + a.count, 0) / totalBookmarks) * 100
        : 0,
    [authors, totalBookmarks]
  );
  const topShareSingle = useMemo(
    () =>
      totalBookmarks > 0 && authors.length > 0
        ? (authors[0].count / totalBookmarks) * 100
        : 0,
    [authors, totalBookmarks]
  );
  const overexposed = useMemo(() => topShareSingle >= 15, [topShareSingle]);

  const listClass =
    variant === "flat" ? analyticsListSurfaceClass : analyticsListSurfaceCardClass;

  return (
    <ChartShell variant={variant}>
      <SectionHeading
        title="Top voices"
        icon={<Users className="h-4 w-4" />}
        meta={authors.length > 0 ? `${authors.length} authors` : undefined}
        variant={variant}
      />
      {authors.length === 0 ? (
        <EmptyBox />
      ) : (
        <div className="flex flex-col gap-3">
          {overexposed ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-sm px-3 py-2 text-xs",
                "border border-note/30 bg-note/8 text-foreground"
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-note" />
              <span>
                <span className="font-medium">@{authors[0].author}</span> is{" "}
                <span className="font-medium tabular-nums">{topShareSingle.toFixed(0)}%</span> of
                your library. Consider diversifying your saves.
              </span>
            </div>
          ) : null}

          <ul className={listClass}>
            {authors.map((a, idx) => {
              const share = (a.count / max) * 100;
              const libraryShare =
                totalBookmarks > 0 ? (a.count / totalBookmarks) * 100 : 0;
              return (
                <li key={a.author}>
                  <Link
                    href={`/dashboard?author=${encodeURIComponent(a.author)}`}
                    className={cn(
                      "group grid grid-cols-[auto_minmax(0,1.6fr)_minmax(0,2fr)_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors",
                      "hover:bg-surface-1"
                    )}
                  >
                    <span className="flex w-5 shrink-0 items-center justify-center text-xs font-semibold tabular-nums text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar size="sm">
                        {a.profileImage ? (
                          <AvatarImage src={a.profileImage} alt={a.displayName ?? a.author} />
                        ) : null}
                        <AvatarFallback>
                          {(a.displayName ?? a.author).slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium">
                            {a.displayName ?? a.author}
                          </span>
                          {a.verified ? (
                            <BadgeCheck
                              className="h-3.5 w-3.5 shrink-0 text-primary"
                              aria-label="Verified"
                            />
                          ) : null}
                        </div>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{a.author}
                        </span>
                      </div>
                    </div>
                    <HighlightProgress
                      className="w-full"
                      percent={share}
                      size="md"
                      durationClass="duration-500"
                    />
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-sm font-medium tabular-nums">
                        {a.count.toLocaleString()}
                      </span>
                      <span className="text-2xs tabular-nums text-muted-foreground">
                        {libraryShare.toFixed(1)}%
                      </span>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>

          {totalBookmarks > 0 && authors.length >= 3 && !overexposed ? (
            <p className="px-1 text-xs text-muted-foreground">
              Your top 3 voices account for{" "}
              <span className="font-medium tabular-nums text-foreground">
                {topShare.toFixed(0)}%
              </span>{" "}
              of your library.
            </p>
          ) : null}
        </div>
      )}
    </ChartShell>
  );
});
