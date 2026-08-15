import {
  ArrowRight,
  Archive,
  BarChart3,
  FolderOpen,
  Layers,
  LibraryBig,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { HighlightProgress } from "@/components/highlight-progress";
import { Button } from "@/components/ui/button";
import {
  bookmarkLabel,
  collectionLabel,
  getCollectionItemCount,
} from "@/lib/collections-presentation";
import type { CollectionWithCount } from "@/types";

type CollectionsOverviewProps = {
  libraryBookmarkCount?: number;
  organizedBookmarkCount: number;
  isLibraryStatsLoading?: boolean;
  totalCollections: number;
  userCollections: number;
  xFolders: number;
  publicCollections: number;
  emptyCollections: number;
  largestCollection: CollectionWithCount | null;
  maxItems: number;
  onCreateCollection: () => void;
  onOrganizeUnshelved: () => void;
  onOpenCollection: (id: string) => void;
};

export function CollectionsOverview({
  libraryBookmarkCount,
  organizedBookmarkCount,
  isLibraryStatsLoading = false,
  totalCollections,
  userCollections,
  xFolders,
  publicCollections,
  emptyCollections,
  largestCollection,
  maxItems,
  onCreateCollection,
  onOrganizeUnshelved,
  onOpenCollection,
}: CollectionsOverviewProps) {
  const unshelvedCount = Math.max(
    0,
    (libraryBookmarkCount ?? organizedBookmarkCount) - organizedBookmarkCount
  );
  const largestCount = largestCollection
    ? getCollectionItemCount(largestCollection)
    : 0;
  const largestWidth =
    maxItems > 0 ? Math.max(8, Math.round((largestCount / maxItems) * 100)) : 0;

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
      <div className="relative overflow-hidden surface-card p-4 sm:p-5">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-primary/15 bg-primary/10 text-primary">
              <LibraryBig className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                className="heading-font text-2xl font-bold tracking-tight sm:text-3xl"
                aria-busy={isLibraryStatsLoading}
              >
                {isLibraryStatsLoading || libraryBookmarkCount === undefined ? (
                  <span className="inline-block h-8 w-28 rounded-sm skeleton-shimmer sm:h-9 sm:w-32" />
                ) : (
                  bookmarkLabel(libraryBookmarkCount)
                )}
              </h2>
              <p
                className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground"
                aria-busy={isLibraryStatsLoading}
              >
                {isLibraryStatsLoading ? (
                  <span className="inline-block h-4 w-56 rounded-sm skeleton-shimmer" />
                ) : (
                  <>
                    {organizedBookmarkCount.toLocaleString()}{" "}
                    {organizedBookmarkCount === 1 ? "bookmark" : "bookmarks"} in{" "}
                    {collectionLabel(totalCollections)}
                    {libraryBookmarkCount !== undefined &&
                    organizedBookmarkCount < libraryBookmarkCount ? (
                      <>
                        {" "}
                        ·{" "}
                        {(
                          libraryBookmarkCount - organizedBookmarkCount
                        ).toLocaleString()}{" "}
                        not yet shelved
                      </>
                    ) : null}
                  </>
                )}
              </p>
              {!isLibraryStatsLoading && unshelvedCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 gap-1.5 px-2 text-xs text-primary"
                  onClick={onOrganizeUnshelved}
                >
                  Organize unshelved in Orbit
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>
          <Button
            variant="highlight"
            size="sm"
            className="h-9 w-full gap-1.5 sm:w-auto"
            onClick={onCreateCollection}
          >
            <Plus className="h-4 w-4" />
            New collection
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <CollectionMetric
            icon={Layers}
            label="Personal"
            value={userCollections.toLocaleString()}
            tone="primary"
          />
          <CollectionMetric
            icon={FolderOpen}
            label="X folders"
            value={xFolders.toLocaleString()}
            tone="note"
          />
          <CollectionMetric
            icon={Sparkles}
            label="Public"
            value={publicCollections.toLocaleString()}
            tone="success"
          />
          <CollectionMetric
            icon={Archive}
            label="Empty"
            value={emptyCollections.toLocaleString()}
            tone="muted"
          />
        </div>
      </div>

      <div className="surface-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-note/10 text-note">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Largest shelf
            </p>
          </div>
        </div>

        {largestCollection ? (
          <button
            type="button"
            className="group mt-4 w-full rounded-sm border border-hairline-soft bg-transparent p-3 text-left transition-colors hover:border-primary/30 hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
            onClick={() => onOpenCollection(largestCollection.id)}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {largestCollection.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bookmarkLabel(largestCount)}
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <HighlightProgress
              className="mt-3"
              percent={largestWidth}
              tone="note"
              size="md"
            />
          </button>
        ) : (
          <div className="mt-4 rounded-sm border border-dashed border-hairline-soft bg-transparent p-3 text-sm text-muted-foreground">
            No shelves yet
          </div>
        )}
      </div>
    </section>
  );
}

function CollectionMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "primary" | "note" | "success" | "muted";
}) {
  const toneClassName = {
    primary: "bg-primary/10 text-primary",
    note: "bg-note/10 text-note",
    success: "bg-success/10 text-success",
    muted: "bg-surface-3 text-muted-foreground",
  }[tone];

  return (
    <div className="surface-inset-strong px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-sm ${toneClassName}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {value}
        </span>
      </div>
      <p className="mt-2 truncate text-xs font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
