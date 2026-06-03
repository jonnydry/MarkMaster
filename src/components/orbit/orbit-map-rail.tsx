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
  hoverSelection: OrbitMapSelection | null;
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
  showLegend?: boolean;
}

/** Shared panel surface for both rail and overlay variants, theme-aware. */
function panelClass(isOrbital: boolean, isOverlay: boolean) {
  if (isOverlay) return "min-w-0";
  return isOrbital
    ? "rounded-sm border border-hairline-soft bg-surface-2/70 p-4 shadow-sm backdrop-blur-sm"
    : "rounded-sm border border-hairline-soft bg-surface-2/70 p-4 shadow-sm backdrop-blur-sm dark:bg-white/[0.04]";
}

function findNode(
  data: OrbitGraphPayload,
  selection: OrbitMapSelection | null
): OrbitGraphNode | null {
  if (!selection) return null;
  return data.nodes.find((node) => node.id === selection.id) ?? null;
}

function pluralize(count: number, singular: string, plural?: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

function getConnectedBookmarkNodes(
  data: OrbitGraphPayload,
  node: OrbitGraphNode
): OrbitGraphNode[] {
  const ids = new Set<string>();
  for (const edge of data.edges) {
    switch (edge.kind) {
      case "bookmark-tag":
        if (node.kind === "tag" && edge.tagId === node.id) {
          ids.add(edge.bookmarkId);
        } else if (node.kind === "bookmark" && edge.bookmarkId === node.id) {
          ids.add(edge.tagId);
        }
        break;
      case "bookmark-collection":
        if (
          node.kind === "collection" &&
          edge.collectionId === node.id
        ) {
          ids.add(edge.bookmarkId);
        } else if (
          node.kind === "bookmark" &&
          edge.bookmarkId === node.id
        ) {
          ids.add(edge.collectionId);
        }
        break;
      case "loose":
        if (node.kind === "core" && edge.bookmarkId) {
          ids.add(edge.bookmarkId);
        } else if (node.kind === "bookmark" && edge.bookmarkId === node.id) {
          ids.add("orbit-index");
        }
        break;
    }
  }
  return data.nodes.filter((n) => ids.has(n.id));
}

export function OrbitMapRail({
  data,
  selection,
  hoverSelection,
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
  showLegend = true,
}: OrbitMapRailProps) {
  const activeSelection = selection ?? hoverSelection;
  const activeNode = findNode(data, activeSelection);
  const connected = useMemo(
    () => (activeNode ? getConnectedBookmarkNodes(data, activeNode) : []),
    [activeNode, data]
  );
  const isOverlay = variant === "overlay";
  const { isOrbital } = useOrbitalTheme();

  return (
    <aside
      className={cn(
        isOverlay
          ? cn(
              "pointer-events-auto flex max-h-[min(68dvh,620px)] w-[min(352px,calc(100vw-2rem))] flex-col overflow-y-auto rounded-sm border p-4 shadow-lg backdrop-blur-2xl [scrollbar-width:thin]",
              orbitHairlineBorder(isOrbital),
              isOrbital ? cn(orbital.glass, "border-primary/25") : "bg-surface-1/90"
            )
          : "flex w-full flex-col gap-3 lg:w-[300px] lg:shrink-0 xl:w-[320px]",
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

      {showLegend && (
        <section
          className={cn(
            isOverlay
              ? cn("mt-4 border-t pt-3", orbitHairlineBorder(isOrbital))
              : panelClass(isOrbital, false)
          )}
        >
          <p className={cn(orbitLabelClass(isOrbital), orbitMetaSoft(isOrbital))}>
            Legend
          </p>
          <ul
            className={cn(
              "mt-3 gap-2 text-sm",
              orbitMetaMuted(isOrbital),
              isOverlay
                ? "grid grid-cols-1 text-xs sm:grid-cols-2"
                : "space-y-2"
            )}
          >
            <li className="flex items-center gap-3">
              <span className="inline-block size-2.5 rounded-full bg-primary" />
              <span>Loose bookmark</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="inline-block size-2.5 rounded-full bg-muted-foreground/60" />
              <span>Assigned bookmark</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="inline-block size-3 rounded-full bg-primary/70" />
              <span>Tag or collection</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="h-px w-5 bg-hairline-strong" />
              <span>Relationship</span>
            </li>
          </ul>
          <p className={cn("mt-3 text-[10px]", orbitMetaMuted(isOrbital))}>
            Scroll to zoom · drag to pan · click to focus · Esc to clear
          </p>
        </section>
      )}
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
  const bodyText = cn("text-sm", orbitMetaMuted(isOrbital));

  if (!node) {
    return (
      <div className="space-y-2">
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
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <OrbitLogoMark className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Orbit index</p>
            <p className={cn("text-xs", orbitMetaMuted(isOrbital))}>
              Central anchor for loose bookmarks
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex size-8 items-center justify-center rounded-sm"
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
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
            onClick={onAssign}
            disabled={!selectedBookmarkId}
          >
            <Crosshair className="size-4" />
            Assign
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-9 gap-1.5", orbitGhostButtonClass(isOrbital))}
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
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
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
        <div className="flex flex-wrap gap-2">
          {actionState.canCopyAsCollection ? (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
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
                className="h-9 gap-1.5 border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
                onClick={onAssign}
                disabled={!actionState.canAssign}
              >
                <Crosshair className="size-4" />
                Assign
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn("h-9 gap-1.5", orbitGhostButtonClass(isOrbital))}
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

    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary/80">
            <GrokMark className="size-4" title="Grok" />
          </span>
          <div className="min-w-0">
            <p className={kicker}>Bookmark</p>
            <p className="truncate text-sm font-semibold text-foreground">
              @{node.authorUsername}
            </p>
          </div>
        </div>
        {focusedBookmarkLoading && !focusedBookmark ? (
          <p className={bodyText}>Loading…</p>
        ) : focusedBookmark ? (
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
            textClassName={cn(
              "line-clamp-5 whitespace-pre-wrap text-sm",
              orbitMetaMuted(isOrbital)
            )}
            galleryClassName="!mt-2"
          />
        ) : (
          <p className={bodyText}>{node.title}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className={cn("h-9 gap-1.5", orbitGhostButtonClass(isOrbital))}
            onClick={onAddTag}
            disabled={!hasExplicitSelection}
          >
            <TagIcon className="size-4" />
            Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-9 gap-1.5", orbitGhostButtonClass(isOrbital))}
            onClick={onAddToCollection}
            disabled={!hasExplicitSelection}
          >
            <Folder className="size-4" />
            Collect
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenBookmark(node.id)}
            disabled={!hasExplicitSelection}
          >
            <ExternalLink className="size-4" />
            Open
          </Button>
        </div>
        {isLoose && (
          <p className={cn("text-xs", orbitMetaSoft(isOrbital))}>
            Not yet tagged or collected
          </p>
        )}
        {tagConnections.length > 0 && (
          <div className="space-y-1.5">
            <p className={cn(orbitLabelClass(isOrbital), orbitMetaMuted(isOrbital))}>
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tagConnections.map((t) =>
                t.kind === "tag" ? (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/60 px-2 py-1 text-xs text-foreground/85"
                  >
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </span>
                ) : null
              )}
            </div>
          </div>
        )}
        {collectionConnections.length > 0 && (
          <div className="space-y-1.5">
            <p className={cn(orbitLabelClass(isOrbital), orbitMetaMuted(isOrbital))}>
              Collections
            </p>
            <div className="flex flex-wrap gap-1.5">
              {collectionConnections.map((c) =>
                c.kind === "collection" ? (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/60 px-2 py-1 text-xs text-foreground/85"
                  >
                    <Folder className="size-3 text-primary" />
                    {c.name}
                  </span>
                ) : null
              )}
            </div>
          </div>
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
        "inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium transition-colors",
        orbitGhostButtonClass(isOrbital)
      )}
    >
      <LayoutGrid className="size-3.5" />
      Dashboard
    </Link>
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
    <div className="space-y-2 pt-1">
      <p className={cn(orbitLabelClass(isOrbital), orbitMetaMuted(isOrbital))}>
        {title} · {bookmarks.length}
      </p>
      <ScrollArea
        className={cn(
          "h-40 rounded-sm border",
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
    <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-3">
      <p className={cn(orbitLabelClass(isOrbital), orbitMetaSoft(isOrbital))}>
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
