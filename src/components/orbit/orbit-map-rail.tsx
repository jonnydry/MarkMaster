"use client";

import {
  Crosshair,
  ExternalLink,
  Folder,
  FolderOpen,
  Orbit as OrbitIcon,
  Sparkles,
  Tag as TagIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function OrbitMapRail({
  data,
  selection,
  hoverSelection,
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

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[320px] lg:shrink-0 xl:w-[340px]">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
          Selected cluster
        </p>
        <SelectedClusterBody
          node={activeNode}
          stats={data.stats}
          focusedBookmark={focusedBookmark}
          focusedBookmarkLoading={focusedBookmarkLoading}
          hasExplicitSelection={Boolean(selection)}
          onAssign={onAssign}
          onAddTag={onAddTag}
          onAddToCollection={onAddToCollection}
          onOpenBookmark={onOpenBookmark}
          onClearSelection={onClearSelection}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
          Map motion
        </p>
        <p className="mt-2 text-sm font-medium text-white">
          Let the structure move, not the camera.
        </p>
        <p className="mt-2 text-sm text-white/65">
          Stable category anchors, slow drift on loose nodes, and short inward
          arcs on assignment keep the map readable during motion.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
          Legend
        </p>
        <ul className="mt-3 space-y-2.5 text-sm text-white/75">
          <li className="flex items-center gap-3">
            <span className="size-2.5 rounded-full bg-sky-400 ring-1 ring-sky-300/70 shadow-[0_0_10px_rgba(56,189,248,0.55)]" />
            <span>Loose or high-attention bookmarks</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-white/60" />
            <span>Assigned bookmarks inside stable groups</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="h-px w-6 bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />
            <span>Relationship pull between clusters</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="inline-flex h-5 items-center rounded-md border border-white/15 bg-white/5 px-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
              +N
            </span>
            <span>More bookmarks hidden for performance</span>
          </li>
        </ul>
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
  onAssign,
  onAddTag,
  onAddToCollection,
  onOpenBookmark,
  onClearSelection,
}: SelectedClusterBodyProps) {
  if (!node) {
    return (
      <div className="mt-2 space-y-3">
        <p className="text-sm font-medium text-white">
          Hover a cluster to inspect it.
        </p>
        <p className="text-sm text-white/65">
          Click a tag, collection, or bookmark to lock it into the rail and
          unlock the assign / tag / collect actions.
        </p>
      </div>
    );
  }

  if (node.kind === "core") {
    return (
      <div className="mt-2 space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
            <OrbitIcon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-white">Orbit index</p>
            <p className="text-xs text-white/60">Core graph anchor</p>
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
        <p className="text-sm text-white/65">
          Loose bookmarks drift on the outer orbit until you pull them into a
          tag cluster or collection.
        </p>
      </div>
    );
  }

  if (node.kind === "tag") {
    return (
      <div className="mt-2 space-y-3">
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
              Tag cluster
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {node.name}
            </p>
          </div>
        </div>
        <p className="text-sm text-white/70">
          {pluralize(node.count, "bookmark")} anchored to this tag. Assign loose
          bookmarks nearby or pull them inward with a single tap.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
            onClick={onAssign}
            disabled={!hasExplicitSelection}
          >
            <Crosshair className="size-4" />
            Assign
          </Button>
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
        </div>
      </div>
    );
  }

  if (node.kind === "collection") {
    const Icon = node.variant === "x_folder" ? FolderOpen : Folder;
    return (
      <div className="mt-2 space-y-3">
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
        <p className="text-sm text-white/70">
          {pluralize(node.count, "bookmark")} live here. Use Collect to move a
          selected bookmark into this home along a gentle inward arc.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
            onClick={onAssign}
            disabled={!hasExplicitSelection || node.variant === "x_folder"}
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
            disabled={!hasExplicitSelection || node.variant === "x_folder"}
          >
            <Folder className="size-4" />
            Collect
          </Button>
        </div>
      </div>
    );
  }

  if (node.kind === "bookmark") {
    return (
      <div className="mt-2 space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-200">
            <Sparkles className="size-4" />
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
            ? "Loading bookmark details…"
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
    return (
      <div className="mt-2 space-y-3">
        <p className="text-sm font-medium text-white">
          {node.remaining.toLocaleString()} more bookmarks
        </p>
        <p className="text-sm text-white/65">
          We cap the visible graph for performance. Open the Orbit queue or a
          specific collection to explore the rest.
        </p>
      </div>
    );
  }

  return null;
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
