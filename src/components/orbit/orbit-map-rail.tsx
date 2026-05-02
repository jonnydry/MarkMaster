"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Crosshair,
  ExternalLink,
  Folder,
  FolderOpen,
  LayoutGrid,
  Orbit as OrbitIcon,
  Tag as TagIcon,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas";
import type {
  BookmarkWithRelations,
  OrbitGraphNode,
  OrbitGraphPayload,
} from "@/types";

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
  onOpenBookmark: (bookmarkId: string) => void;
  onClearSelection: () => void;
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
  onOpenBookmark,
  onClearSelection,
}: OrbitMapRailProps) {
  const activeSelection = selection ?? hoverSelection;
  const activeNode = findNode(data, activeSelection);
  const connected = useMemo(
    () => (activeNode ? getConnectedBookmarkNodes(data, activeNode) : []),
    [activeNode, data]
  );

  return (
    <aside className="flex w-full flex-col gap-3 lg:w-[300px] lg:shrink-0 xl:w-[320px]">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
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
          onOpenBookmark={onOpenBookmark}
          onClearSelection={onClearSelection}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
          Legend
        </p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-3">
            <span className="inline-block size-2.5 rounded-full bg-amber-300" />
            <span>Loose bookmark</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="inline-block size-2.5 rounded-full bg-slate-200" />
            <span>Assigned bookmark</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="inline-block size-3 rounded-full bg-blue-400" />
            <span>Tag or collection</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="h-px w-5 bg-slate-400/50" />
            <span>Relationship</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-white/50">
          Scroll to zoom · drag to pan · click to focus · Esc to clear
        </p>
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
  onOpenBookmark: (bookmarkId: string) => void;
  onClearSelection: () => void;
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
  onOpenBookmark,
  onClearSelection,
}: SelectedClusterBodyProps) {
  if (!node) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-white">Select a node</p>
        <p className="text-sm text-white/65">
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
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
            <OrbitIcon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-white">Orbit index</p>
            <p className="text-xs text-white/60">Central anchor for loose bookmarks</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <RailMetric
            label="Total"
            value={stats.totalBookmarks.toLocaleString()}
          />
          <RailMetric
            label="Loose"
            value={stats.looseBookmarks.toLocaleString()}
          />
        </div>
        {connected.length > 0 && (
          <ConnectedList
            title="Loose bookmarks"
            nodes={connected}
            onOpenBookmark={onOpenBookmark}
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
            className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `${node.color}22`,
              color: node.color,
            }}
          >
            <TagIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
              Tag
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {node.name}
            </p>
          </div>
        </div>
        <p className="text-sm text-white/65">
          {pluralize(node.count, "bookmark")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
            onClick={onAssign}
            disabled={!selectedBookmarkId}
          >
            <Crosshair className="size-4" />
            Assign
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={onAddTag}
            disabled={!selectedBookmarkId}
          >
            <TagIcon className="size-4" />
            Tag
          </Button>
          <Link
            href={`/dashboard?tag=${encodeURIComponent(node.id)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-medium text-white/85 transition-colors hover:bg-white/10"
          >
            <LayoutGrid className="size-3.5" />
            Dashboard
          </Link>
        </div>
        {connected.length > 0 && (
          <ConnectedList
            title="Connected bookmarks"
            nodes={connected}
            onOpenBookmark={onOpenBookmark}
          />
        )}
      </div>
    );
  }

  if (node.kind === "collection") {
    const Icon = node.variant === "x_folder" ? FolderOpen : Folder;
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
              {node.variant === "x_folder" ? "X folder" : "Collection"}
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {node.name}
            </p>
          </div>
        </div>
        <p className="text-sm text-white/65">
          {pluralize(node.count, "bookmark")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
            onClick={onAssign}
            disabled={!selectedBookmarkId || node.variant === "x_folder"}
            title={
              node.variant === "x_folder"
                ? "X folders are read-only"
                : undefined
            }
          >
            <Crosshair className="size-4" />
            Assign
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={onAddToCollection}
            disabled={!selectedBookmarkId || node.variant === "x_folder"}
          >
            <Folder className="size-4" />
            Collect
          </Button>
          {node.variant !== "x_folder" && (
            <Link
              href={`/dashboard?collection=${encodeURIComponent(node.id)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              <LayoutGrid className="size-3.5" />
              Dashboard
            </Link>
          )}
        </div>
        {connected.length > 0 && (
          <ConnectedList
            title="Connected bookmarks"
            nodes={connected}
            onOpenBookmark={onOpenBookmark}
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
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-200">
            <GrokMark className="size-4" title="Grok" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
              Bookmark
            </p>
            <p className="truncate text-sm font-semibold text-white">
              @{node.authorUsername}
            </p>
          </div>
        </div>
        <p className="text-sm text-white/70">
          {focusedBookmarkLoading && !focusedBookmark
            ? "Loading…"
            : focusedBookmark?.tweetText ?? node.title}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={onAddTag}
            disabled={!hasExplicitSelection}
          >
            <TagIcon className="size-4" />
            Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={onAddToCollection}
            disabled={!hasExplicitSelection}
          >
            <Folder className="size-4" />
            Collect
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 text-white/70 hover:text-white"
            onClick={() => onOpenBookmark(node.id)}
            disabled={!hasExplicitSelection}
          >
            <ExternalLink className="size-4" />
            Open
          </Button>
        </div>
        {isLoose && (
          <p className="text-xs text-amber-300/80">Not yet tagged or collected</p>
        )}
        {tagConnections.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tagConnections.map((t) =>
                t.kind === "tag" ? (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80"
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
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
              Collections
            </p>
            <div className="flex flex-wrap gap-1.5">
              {collectionConnections.map((c) =>
                c.kind === "collection" ? (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80"
                  >
                    <Folder className="size-3 text-sky-300" />
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
            className="text-xs text-white/55 underline-offset-2 hover:text-white hover:underline"
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

function ConnectedList({
  title,
  nodes,
  onOpenBookmark,
}: {
  title: string;
  nodes: OrbitGraphNode[];
  onOpenBookmark: (bookmarkId: string) => void;
}) {
  const bookmarks = nodes.filter((n) => n.kind === "bookmark");
  if (bookmarks.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
        {title} · {bookmarks.length}
      </p>
      <ScrollArea className="h-40 rounded-xl border border-white/8 bg-white/[0.03]">
        <ul className="space-y-0.5 p-2">
          {bookmarks.slice(0, 50).map((b) =>
            b.kind === "bookmark" ? (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onOpenBookmark(b.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/75 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <span
                    className={cn(
                      "inline-block size-1.5 shrink-0 rounded-full",
                      b.affiliated ? "bg-slate-200" : "bg-amber-300"
                    )}
                  />
                  <span className="min-w-0 truncate">
                    @{b.authorUsername}
                  </span>
                </button>
              </li>
            ) : null
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}

function RailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/55">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-white">
        {value}
      </p>
    </div>
  );
}

