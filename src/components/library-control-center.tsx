"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  FolderOpen,
  Orbit,
  Search,
  Tags,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { cn } from "@/lib/utils";

type LibraryControlCenterProps = {
  totalBookmarks: number;
  untriagedCount: number;
  totalTags?: number;
  totalCollections?: number;
  notedCount?: number;
  lastSyncAt?: Date | string | null;
  onSyncComplete?: () => void;
  className?: string;
  compact?: boolean;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function LibraryControlCenter({
  totalBookmarks,
  untriagedCount,
  totalTags = 0,
  totalCollections = 0,
  notedCount,
  lastSyncAt,
  onSyncComplete,
  className,
  compact = false,
}: LibraryControlCenterProps) {
  const hasBookmarks = totalBookmarks > 0;
  const allOrganized = hasBookmarks && untriagedCount === 0;
  const syncDate = toDate(lastSyncAt);
  const primaryHref = !hasBookmarks
    ? "/dashboard"
    : untriagedCount > 0
      ? "/orbit"
      : totalCollections > 0
        ? "/collections"
        : "/dashboard";
  const primaryLabel = !hasBookmarks
    ? "Sync first"
    : untriagedCount > 0
      ? "Review Orbit"
      : totalCollections > 0
        ? "Open collections"
        : "Find bookmarks";
  const primaryCopy = !hasBookmarks
    ? "Bring in your saved X posts, then let Orbit find what needs decisions."
    : untriagedCount > 0
      ? `${untriagedCount.toLocaleString()} bookmark${
          untriagedCount === 1 ? "" : "s"
        } still need a tag or collection.`
      : "Every visible bookmark has a home. Keep the loop healthy with search, notes, and shareable collections.";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline-soft bg-surface-1 shadow-sm",
        className
      )}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Library control center
              </p>
              <h2 className="mt-2 heading-font text-xl font-semibold tracking-tight text-foreground">
                {allOrganized ? "Your library is in shape" : "Make the next move obvious"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {primaryCopy}
              </p>
            </div>
            <Link
              href={primaryHref}
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-9 shrink-0 gap-1.5"
              )}
            >
              {primaryLabel}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <ControlMetric
              label="Bookmarks"
              value={totalBookmarks.toLocaleString()}
              icon={Bookmark}
            />
            <ControlMetric
              label="In Orbit"
              value={untriagedCount.toLocaleString()}
              icon={Orbit}
              active={untriagedCount > 0}
            />
            <ControlMetric
              label="Tags"
              value={totalTags.toLocaleString()}
              icon={Tags}
            />
            <ControlMetric
              label="Collections"
              value={totalCollections.toLocaleString()}
              icon={FolderOpen}
            />
          </div>

          {!compact ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <ActionLink
                href="/dashboard"
                icon={Search}
                label="Search across posts, authors, and notes"
              />
              <ActionLink
                href="/orbit"
                icon={Orbit}
                label="Use Orbit for unsorted saves"
              />
              <ActionLink
                href="/analytics"
                icon={BarChart3}
                label={
                  notedCount === undefined
                    ? "Check library health"
                    : `${notedCount.toLocaleString()} bookmarks with notes`
                }
              />
            </div>
          ) : null}
        </div>

        <div className="border-t border-hairline-soft bg-surface-2/55 p-4 lg:border-l lg:border-t-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sync status
          </p>
          <SyncButton
            lastSyncAt={syncDate}
            onSyncComplete={onSyncComplete}
            bookmarkCount={totalBookmarks}
            detail={compact ? "compact" : "full"}
          />
        </div>
      </div>
    </section>
  );
}

function ControlMetric({
  label,
  value,
  icon: Icon,
  active = false,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active?: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline-soft bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-3.5",
            active ? "text-primary" : "text-muted-foreground"
          )}
          aria-hidden
        />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 heading-font text-lg font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ActionLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-hairline-soft bg-surface-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
    >
      <Icon className="size-4 shrink-0 text-primary/75" aria-hidden />
      <span className="min-w-0 leading-5">{label}</span>
    </Link>
  );
}
