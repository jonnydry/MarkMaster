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
  Sparkles,
  Tags,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { buildOrbitIntentHref } from "@/lib/orbit-navigation";
import { trackFlywheelEvent } from "@/lib/flywheel";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
import { orbital, OrbitalBadge } from "@/components/orbital";
import { useTypography } from "@/hooks/use-typography";

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
  orbitHref?: string;
  /** Count of raw untouched bookmarks (no tags, not in any collection) — Highlights pool. */
  pendingHighlightsCount?: number;
  /** Untagged bookmarks not in a user collection — broader Orbit queue. */
  orbitQueueCount?: number;
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
  orbitHref,
  pendingHighlightsCount = 0,
  orbitQueueCount,
}: LibraryControlCenterProps) {
  const { isOrbital } = useOrbitalTheme();
  const t = useTypography();
  const hasBookmarks = totalBookmarks > 0;
  const allOrganized = hasBookmarks && untriagedCount === 0;
  const syncDate = toDate(lastSyncAt);
  const resolvedOrbitHref =
    orbitHref ??
    buildOrbitIntentHref({
      intent: "backlog",
      orbitQueueCount: untriagedCount,
    });
  const primaryHref = !hasBookmarks
    ? "/dashboard"
    : untriagedCount > 0
      ? resolvedOrbitHref
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
        } still need a tag or collection — including high-performers from your Highlights.`
      : "Every visible bookmark has a home. Keep the loop healthy with search, notes, and shareable collections.";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/70",
        className
      )}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.14em]",
                t.monoNative ? cn(t.label, "text-primary/80") : "text-muted-foreground"
              )}>
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

          {pendingHighlightsCount > 0 && (
            isOrbital ? (
              <div className={cn(orbital.glass, "mt-3 flex flex-wrap items-center gap-2 border border-primary/20 px-3 py-1.5 text-[12px] text-primary/90")}>
                <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span className={cn(orbital.label, "font-medium text-primary/90")}>
                  {pendingHighlightsCount.toLocaleString()} untouched high-performer
                  {pendingHighlightsCount === 1 ? "" : "s"} in Highlights
                  {orbitQueueCount != null && orbitQueueCount > pendingHighlightsCount
                    ? ` · ${orbitQueueCount.toLocaleString()} in Orbit queue`
                    : ""}
                  {lastSyncAt ? " since last sync" : ""}
                </span>
                <OrbitalBadge tone="cyan" className="ml-auto shrink-0 text-[10px]">Review in Orbit</OrbitalBadge>
                <Link
                  href={resolvedOrbitHref}
                  onClick={() => {
                    trackFlywheelEvent("cta.review_in_orbit", { source: "library_control" });
                  }}
                  className="shrink-0 text-[10px] font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  →
                </Link>
              </div>
            ) : (
              // Default (non-orbital) experience: byte-for-byte original amber banner untouched
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[12px] text-amber-700">
                <Sparkles className="size-3.5 shrink-0" aria-hidden />
                <span className="font-medium">
                  {pendingHighlightsCount.toLocaleString()} untouched high-performer
                  {pendingHighlightsCount === 1 ? "" : "s"} in Highlights
                  {orbitQueueCount != null && orbitQueueCount > pendingHighlightsCount
                    ? ` · ${orbitQueueCount.toLocaleString()} in Orbit queue`
                    : ""}
                  {lastSyncAt ? " since last sync" : ""}
                </span>
                <Link
                  href={resolvedOrbitHref}
                  onClick={() => {
                    // Phase 3 Item 12 Slice 1: instrument explicit "Review in Orbit" from Library Control Center pending banner
                    trackFlywheelEvent("cta.review_in_orbit", { source: "library_control" });
                  }}
                  className="ml-auto shrink-0 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                  Review in Orbit →
                </Link>
              </div>
            )
          )}

          {!compact ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <ActionLink
                href="/dashboard"
                icon={Search}
                label="Search across posts, authors, and notes"
              />
              <ActionLink
                href={resolvedOrbitHref}
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

        <div className="border-t border-hairline-soft bg-transparent p-4 lg:border-l lg:border-t-0">
          <p className={cn(
            "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]",
            t.monoNative ? cn(t.label, "text-primary/80") : "text-muted-foreground"
          )}>
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
  const { isOrbital } = useOrbitalTheme();
  const t = useTypography();
  return (
    <div className={
      isOrbital
        ? cn(orbital.glass, "rounded-sm px-3 py-2.5")
        : "rounded-sm border border-hairline-soft bg-transparent px-3 py-2.5"
    }>
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-3.5",
            active ? "text-primary" : "text-muted-foreground"
          )}
          aria-hidden
        />
        <span className={cn(
          "text-[11px]",
          t.monoNative ? t.label : "text-muted-foreground"
        )}>{label}</span>
      </div>
      <p className={cn(
        "mt-1 font-semibold tabular-nums",
        t.monoNative ? t.data : "heading-font text-lg"
      )}>
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
  const { isOrbital } = useOrbitalTheme();
  return (
    <Link
      href={href}
      className={
        isOrbital
          ? cn(
              orbital.glass,
              "inline-flex min-h-10 items-center gap-2 rounded-sm border border-primary/15 px-3 py-2 text-sm font-medium text-primary/80 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            )
          : "inline-flex min-h-10 items-center gap-2 rounded-sm border border-hairline-soft bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/25 hover:bg-accent-soft hover:text-foreground"
      }
    >
      <Icon className="size-4 shrink-0 text-primary/75" aria-hidden />
      <span className="min-w-0 leading-5">{label}</span>
    </Link>
  );
}
