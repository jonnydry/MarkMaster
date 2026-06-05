"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Copy,
  Crosshair,
  ExternalLink,
  Folder,
  FolderOpen,
  LayoutGrid,
  Loader2,
  Tag as TagIcon,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildOrbitMapConnectionIndex,
  getConnectedOrbitMapNodes,
} from "@/lib/orbit-map-connections";
import { getOrbitCollectionActionState } from "@/lib/orbit-map-actions";
import {
  orbitGhostButtonClass,
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMetaMuted,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type {
  BookmarkWithRelations,
  OrbitGraphNode,
  OrbitGraphPayload,
} from "@/types";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { useOrbitalTheme } from "@/components/providers";
import { orbital } from "@/components/orbital";

interface OrbitMapRailProps {
  data: OrbitGraphPayload;
  selection: OrbitMapSelection | null;
  selectedBookmarkId: string | null;
  focusedBookmark: BookmarkWithRelations | null;
  focusedBookmarkLoading: boolean;
  onAssign: () => void;
  onAddTag: () => void;
  onAddToCollection: () => void;
  onCopyAsCollection: (collectionId: string) => void;
  onOpenBookmark: (bookmarkId: string) => void;
  onClearSelection: () => void;
  copyingCollectionId?: string | null;
  variant?: "rail" | "overlay";
  className?: string;
}

/** Shared panel surface for both rail and overlay variants, theme-aware. */
function panelClass(isOrbital: boolean, isOverlay: boolean) {
  if (isOverlay) return "min-w-0 overflow-hidden";
  return isOrbital
    ? "min-w-0 overflow-hidden rounded-sm border border-hairline-soft bg-surface-2/70 p-4 shadow-sm backdrop-blur-sm"
    : "min-w-0 overflow-hidden rounded-sm border border-hairline-soft bg-surface-2/70 p-4 shadow-sm backdrop-blur-sm dark:bg-white/[0.04]";
}

function pluralize(count: number, singular: string, plural?: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

export function OrbitMapRail({
  data,
  selection,
  selectedBookmarkId,
  focusedBookmark,
  focusedBookmarkLoading,
  onAssign,
  onAddTag,
  onAddToCollection,
  onCopyAsCollection,
  onOpenBookmark,
  onClearSelection,
  copyingCollectionId,
  variant = "rail",
  className,
}: OrbitMapRailProps) {
  const nodeById = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes]
  );
  const activeNode = selection ? nodeById.get(selection.id) ?? null : null;
  const connectedNodeIdsById = useMemo(
    () => buildOrbitMapConnectionIndex(data.edges),
    [data.edges]
  );
  const connected = useMemo(() => {
    if (!activeNode) return [];
    return getConnectedOrbitMapNodes(
      activeNode.id,
      nodeById,
      connectedNodeIdsById
    );
  }, [activeNode, connectedNodeIdsById, nodeById]);
  const isOverlay = variant === "overlay";
  const { isOrbital } = useOrbitalTheme();

  return (
    <aside
      className={cn(
        isOverlay
          ? cn(
              "pointer-events-auto flex max-h-[min(68dvh,620px)] w-[min(352px,calc(100vw-2rem))] min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-sm border p-4 shadow-lg backdrop-blur-2xl [scrollbar-width:thin]",
              orbitHairlineBorder(isOrbital),
              isOrbital ? cn(orbital.glass, "border-primary/25") : "bg-surface-1/90"
            )
          : "flex min-w-0 w-full flex-col gap-3 overflow-x-hidden lg:w-[300px] lg:shrink-0 xl:w-[320px]",
        className
      )}
    >
      <section className={panelClass(isOrbital, isOverlay)}>
        <SelectedClusterBody
          node={activeNode}
          stats={data.stats}
          focusedBookmark={focusedBookmark}
          focusedBookmarkLoading={focusedBookmarkLoading}
          hasExplicitSelection={Boolean(selection)}
          selectedBookmarkId={selectedBookmarkId}
          connected={connected}
          onAssign={onAssign}
          onAddTag={onAddTag}
          onAddToCollection={onAddToCollection}
          onCopyAsCollection={onCopyAsCollection}
          onOpenBookmark={onOpenBookmark}
          onClearSelection={onClearSelection}
          copyingCollectionId={copyingCollectionId}
          isOverlay={isOverlay}
          isOrbital={isOrbital}
        />
      </section>
    </aside>
  );
}

interface SelectedClusterBodyProps {
  node: OrbitGraphNode | null;
  stats: OrbitGraphPayload["stats"];
  focusedBookmark: BookmarkWithRelations | null;
  focusedBookmarkLoading: boolean;
  hasExplicitSelection: boolean;
  selectedBookmarkId: string | null;
  connected: OrbitGraphNode[];
  onAssign: () => void;
  onAddTag: () => void;
  onAddToCollection: () => void;
  onCopyAsCollection: (collectionId: string) => void;
  onOpenBookmark: (bookmarkId: string) => void;
  onClearSelection: () => void;
  copyingCollectionId?: string | null;
  isOverlay: boolean;
  isOrbital: boolean;
}

function SelectedClusterBody({
  node,
  stats,
  focusedBookmark,
  focusedBookmarkLoading,
  hasExplicitSelection,
  selectedBookmarkId,
  connected,
  onAssign,
  onAddTag,
  onAddToCollection,
  onCopyAsCollection,
  onOpenBookmark,
  onClearSelection,
  copyingCollectionId,
  isOverlay,
  isOrbital,
}: SelectedClusterBodyProps) {
  const kicker = cn(orbitLabelClass(isOrbital), orbitMetaSoft(isOrbital));
  const bodyText = cn("min-w-0 break-words text-sm", orbitMetaMuted(isOrbital));

  if (!node) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium text-foreground">Select a node</p>
        <p className={bodyText}>
          Click a tag, collection, or bookmark on the graph to see details and
          move it into a home.
        </p>
      </div>
    );
  }

  if (node.kind === "core") {
    return (
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <OrbitLogoMark className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Orbit index</p>
            <p className={cn("text-xs", orbitMetaMuted(isOrbital))}>
              Central anchor for loose bookmarks
            </p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <RailMetric
            label="Total"
            value={stats.totalBookmarks.toLocaleString()}
            isOrbital={isOrbital}
          />
          <RailMetric
            label="Loose"
            value={stats.looseBookmarks.toLocaleString()}
            isOrbital={isOrbital}
          />
        </div>
        {connected.length > 0 && (
          <ConnectedList
            title="Loose bookmarks"
            nodes={connected}
            onOpenBookmark={onOpenBookmark}
            isOverlay={isOverlay}
            isOrbital={isOrbital}
          />
        )}
      </div>
    );
  }

  if (node.kind === "tag") {
    return (
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm"
            style={{
              backgroundColor: `${node.color}22`,
              color: node.color,
            }}
          >
            <TagIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className={kicker}>Tag</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {node.name}
            </p>
          </div>
        </div>
        <p className={bodyText}>{pluralize(node.count, "bookmark")}</p>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 min-w-0 justify-center gap-1.5 border-primary/25 bg-primary/10 px-2 text-primary hover:bg-primary/15"
            onClick={onAssign}
            disabled={!selectedBookmarkId}
          >
            <Crosshair className="size-4" />
            Assign
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-9 min-w-0 justify-center gap-1.5 px-2",
              orbitGhostButtonClass(isOrbital)
            )}
            onClick={onAddTag}
            disabled={!selectedBookmarkId}
          >
            <TagIcon className="size-4" />
            Tag
          </Button>
          <DashboardLink
            href={`/dashboard?tag=${encodeURIComponent(node.id)}`}
            isOrbital={isOrbital}
          />
        </div>
        {connected.length > 0 && (
          <ConnectedList
            title="Connected bookmarks"
            nodes={connected}
            onOpenBookmark={onOpenBookmark}
            isOverlay={isOverlay}
            isOrbital={isOrbital}
          />
        )}
      </div>
    );
  }

  if (node.kind === "collection") {
    const Icon = node.variant === "x_folder" ? FolderOpen : Folder;
    const actionState = getOrbitCollectionActionState(node, selectedBookmarkId);
    const isCopying = copyingCollectionId === node.id;
    return (
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className={kicker}>
              {node.variant === "x_folder" ? "X folder" : "Collection"}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {node.name}
            </p>
          </div>
        </div>
        <p className={bodyText}>{pluralize(node.count, "bookmark")}</p>
        {actionState.readOnlyReason && (
          <p className={cn("text-xs leading-5", orbitMetaMuted(isOrbital))}>
            {actionState.readOnlyReason}
          </p>
        )}
        <div className="grid min-w-0 grid-cols-2 gap-2">
          {actionState.canCopyAsCollection ? (
            <Button
              size="sm"
              variant="outline"
              className="h-9 min-w-0 justify-center gap-1.5 border-primary/25 bg-primary/10 px-2 text-primary hover:bg-primary/15"
              onClick={() => onCopyAsCollection(node.id)}
              disabled={isCopying}
            >
              {isCopying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              Copy as collection
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-9 min-w-0 justify-center gap-1.5 border-primary/25 bg-primary/10 px-2 text-primary hover:bg-primary/15"
                onClick={onAssign}
                disabled={!actionState.canAssign}
              >
                <Crosshair className="size-4" />
                Assign
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-9 min-w-0 justify-center gap-1.5 px-2",
                  orbitGhostButtonClass(isOrbital)
                )}
                onClick={onAddToCollection}
                disabled={!actionState.canCollect}
              >
                <Folder className="size-4" />
                Collect
              </Button>
            </>
          )}
          {node.variant !== "x_folder" && (
            <DashboardLink
              href={`/dashboard?collection=${encodeURIComponent(node.id)}`}
              isOrbital={isOrbital}
            />
          )}
        </div>
        {connected.length > 0 && (
          <ConnectedList
            title="Connected bookmarks"
            nodes={connected}
            onOpenBookmark={onOpenBookmark}
            isOverlay={isOverlay}
            isOrbital={isOrbital}
          />
        )}
      </div>
    );
  }

  if (node.kind === "bookmark") {
    const tagConnections = connected.filter((n) => n.kind === "tag");
    const collectionConnections = connected.filter(
      (n) => n.kind === "collection"
    );
    const isLoose = tagConnections.length === 0 && collectionConnections.length === 0;
    const hasMedia = Boolean(focusedBookmark?.media?.length);

    return (
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary/80">
            <GrokMark className="size-4" title="Grok" />
          </span>
          <div className="min-w-0">
            <p className={kicker}>Bookmark</p>
            <p className="truncate text-sm font-semibold text-foreground">
              @{node.authorUsername}
            </p>
          </div>
        </div>

        <BookmarkInspectorStatus
          isLoose={isLoose}
          tagCount={tagConnections.length}
          collectionCount={collectionConnections.length}
          isOrbital={isOrbital}
        />

        <div className="grid min-w-0 grid-cols-2 gap-2 min-[420px]:grid-cols-3">
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-9 min-w-0 justify-center gap-1.5 px-2",
              orbitGhostButtonClass(isOrbital)
            )}
            onClick={onAddTag}
            disabled={!hasExplicitSelection}
          >
            <TagIcon className="size-4" />
            Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-9 min-w-0 justify-center gap-1.5 px-2",
              orbitGhostButtonClass(isOrbital)
            )}
            onClick={onAddToCollection}
            disabled={!hasExplicitSelection}
          >
            <Folder className="size-4" />
            Collect
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 min-w-0 justify-center gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenBookmark(node.id)}
            disabled={!hasExplicitSelection}
          >
            <ExternalLink className="size-4" />
            Open
          </Button>
        </div>

        {tagConnections.length > 0 || collectionConnections.length > 0 ? (
          <div className="min-w-0 space-y-2 overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/35 p-3">
            <p className={cn(orbitLabelClass(isOrbital), orbitMetaMuted(isOrbital))}>
              Relationships
            </p>
            {tagConnections.length > 0 && (
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {tagConnections.map((t) =>
                  t.kind === "tag" ? (
                    <span
                      key={t.id}
                      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/60 px-2 py-1 text-xs text-foreground/85"
                    >
                      <span
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="min-w-0 truncate">{t.name}</span>
                    </span>
                  ) : null
                )}
              </div>
            )}
            {collectionConnections.length > 0 && (
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {collectionConnections.map((c) =>
                  c.kind === "collection" ? (
                    <span
                      key={c.id}
                      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/60 px-2 py-1 text-xs text-foreground/85"
                    >
                      <Folder className="size-3 shrink-0 text-primary" />
                      <span className="min-w-0 truncate">{c.name}</span>
                    </span>
                  ) : null
                )}
              </div>
            )}
          </div>
        ) : (
          <p className={cn("text-xs", orbitMetaSoft(isOrbital))}>
            Not yet tagged or collected
          </p>
        )}

        {focusedBookmarkLoading && !focusedBookmark ? (
          <p className={bodyText}>Loading…</p>
        ) : focusedBookmark ? (
          <div className="min-w-0 space-y-2 overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/25 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className={cn(orbitLabelClass(isOrbital), orbitMetaMuted(isOrbital))}>
                Evidence
              </p>
              {hasMedia && (
                <span className={cn("text-[10px]", orbitMetaSoft(isOrbital))}>
                  Media attached
                </span>
              )}
            </div>
            <BookmarkPostPreview
              tweetText={focusedBookmark.tweetText}
              authorUsername={focusedBookmark.authorUsername}
              media={focusedBookmark.media}
              tweetLink={{
                authorUsername: focusedBookmark.authorUsername,
                tweetId: focusedBookmark.tweetId,
              }}
              bookmarkKey={focusedBookmark.id}
              variant="inline"
              priorityMedia={!isOverlay}
              className="min-w-0"
              textClassName={cn(
                "min-w-0 break-words line-clamp-4 whitespace-pre-wrap text-sm leading-5",
                orbitMetaMuted(isOrbital)
              )}
              galleryClassName="!mt-2 min-w-0 max-h-56 w-full overflow-hidden border-hairline-soft/70"
            />
          </div>
        ) : (
          <p className={bodyText}>{node.title}</p>
        )}
        {hasExplicitSelection && (
          <button
            type="button"
            className={cn(
              "text-xs underline-offset-2 hover:underline",
              orbitMetaSoft(isOrbital),
              "hover:text-foreground"
            )}
            onClick={onClearSelection}
          >
            Clear selection
          </button>
        )}
      </div>
    );
  }

  if (node.kind === "overflow") {
    return null;
  }

  return null;
}

function DashboardLink({ href, isOrbital }: { href: string; isOrbital: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-sm border px-3 text-xs font-medium transition-colors",
        orbitGhostButtonClass(isOrbital)
      )}
    >
      <LayoutGrid className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">Dashboard</span>
    </Link>
  );
}

function BookmarkInspectorStatus({
  isLoose,
  tagCount,
  collectionCount,
  isOrbital,
}: {
  isLoose: boolean;
  tagCount: number;
  collectionCount: number;
  isOrbital: boolean;
}) {
  const cardClass =
    "min-w-0 overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/45 px-2 py-2";
  const labelClass = cn(
    orbitLabelClass(isOrbital),
    orbitMetaSoft(isOrbital),
    "truncate tracking-[0.14em]"
  );

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
      <div className={cardClass}>
        <p className={labelClass}>Status</p>
        <p className="mt-1 truncate text-xs font-semibold text-foreground">
          {isLoose ? "Loose" : "Assigned"}
        </p>
      </div>
      <div className={cardClass}>
        <p className={labelClass}>Tags</p>
        <p className="mt-1 truncate text-xs font-semibold tabular-nums text-foreground">
          {tagCount}
        </p>
      </div>
      <div className={cardClass}>
        <p className={labelClass}>Collections</p>
        <p className="mt-1 truncate text-xs font-semibold tabular-nums text-foreground">
          {collectionCount}
        </p>
      </div>
    </div>
  );
}

function ConnectedList({
  title,
  nodes,
  onOpenBookmark,
  isOverlay,
  isOrbital,
}: {
  title: string;
  nodes: OrbitGraphNode[];
  onOpenBookmark: (bookmarkId: string) => void;
  isOverlay: boolean;
  isOrbital: boolean;
}) {
  const bookmarks = nodes.filter((n) => n.kind === "bookmark");
  if (bookmarks.length === 0) return null;

  return (
    <div className="min-w-0 space-y-2 pt-1">
      <p className={cn(orbitLabelClass(isOrbital), orbitMetaMuted(isOrbital))}>
        {title} · {bookmarks.length}
      </p>
      <ScrollArea
        className={cn(
          "h-40 min-w-0 rounded-sm border",
          orbitHairlineBorder(isOrbital),
          isOverlay ? "bg-surface-1/40" : "bg-surface-1/55"
        )}
      >
        <ul className="space-y-0.5 p-2">
          {bookmarks.slice(0, 50).map((b) =>
            b.kind === "bookmark" ? (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onOpenBookmark(b.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground"
                >
                  <span
                    className={cn(
                      "inline-block size-1.5 shrink-0 rounded-full",
                      b.affiliated ? "bg-muted-foreground/60" : "bg-primary"
                    )}
                  />
                  <span className="min-w-0 truncate">@{b.authorUsername}</span>
                </button>
              </li>
            ) : null
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}

function RailMetric({
  label,
  value,
  isOrbital,
}: {
  label: string;
  value: string;
  isOrbital: boolean;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/55 p-3">
      <p className={cn(orbitLabelClass(isOrbital), orbitMetaSoft(isOrbital), "truncate")}>
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
