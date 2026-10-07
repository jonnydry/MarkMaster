"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Crosshair,
  Folder,
  FolderOpen,
  Loader2,
  Maximize2,
  Tag as TagIcon,
  X,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { TagDot } from "@/components/tag-dot";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import { appOverlayPanelClassName } from "@/lib/app-layout";
import {
  getOrbitCollectionActionState,
  type OrbitMapArmedBookmark,
} from "@/lib/orbit-map-actions";
import {
  buildOrbitMapConnectionIndex,
  getConnectedOrbitMapNodes,
  getSharedOrbitMapHubs,
  type OrbitMapHubNode,
} from "@/lib/orbit-map-connections";
import {
  orbitGhostButtonClass,
  orbitHairlineBorder,
  orbitLabelClass,
} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  OrbitGraphNode,
  OrbitGraphPayload,
} from "@/types";

interface OrbitMapRailProps {
  data: OrbitGraphPayload;
  selection: OrbitMapSelection | null;
  selectedBookmarkId: string | null;
  /** Bookmark a hub's Assign acts on (null unless a tag/collection is selected). */
  armedBookmark?: OrbitMapArmedBookmark | null;
  focusedBookmark: BookmarkWithRelations | null;
  focusedBookmarkLoading: boolean;
  onAssign: () => void;
  onAddTag: () => void;
  onAddToCollection: () => void;
  onCopyAsCollection: (collectionId: string) => void;
  onOpenBookmark: (bookmarkId: string) => void;
  onSelectNode?: (bookmarkId: string) => void;
  /** Jump to a tag/collection hub (relationship and "shares with" chips). */
  onSelectHub?: (hub: { kind: "tag" | "collection"; id: string }) => void;
  onClearSelection: () => void;
  nodeById?: Map<string, OrbitGraphNode>;
  connectionIndex?: Map<string, string[]> | null;
  copyingCollectionId?: string | null;
  variant?: "rail" | "overlay" | "dock";
  className?: string;
}

function pluralize(count: number, singular: string, plural?: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

const sectionClass = "min-w-0 space-y-2 border-t border-hairline-soft pt-3";

export function OrbitMapRail({
  data,
  selection,
  selectedBookmarkId,
  armedBookmark = null,
  focusedBookmark,
  focusedBookmarkLoading,
  onAssign,
  onAddTag,
  onAddToCollection,
  onCopyAsCollection,
  onOpenBookmark,
  onSelectNode,
  onSelectHub,
  onClearSelection,
  nodeById: nodeByIdProp,
  connectionIndex: connectionIndexProp,
  copyingCollectionId,
  variant = "rail",
  className,
}: OrbitMapRailProps) {
  const nodeById = useMemo(
    () => nodeByIdProp ?? new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes, nodeByIdProp]
  );
  const activeNode = selection ? nodeById.get(selection.id) ?? null : null;
  const connectionIndex = useMemo(
    () => connectionIndexProp ?? buildOrbitMapConnectionIndex(data.edges),
    [connectionIndexProp, data.edges]
  );
  const connected = useMemo(
    () =>
      activeNode
        ? getConnectedOrbitMapNodes(activeNode.id, nodeById, connectionIndex)
        : [],
    [activeNode, connectionIndex, nodeById]
  );
  const sharedHubs = useMemo(
    () =>
      activeNode && (activeNode.kind === "tag" || activeNode.kind === "collection")
        ? getSharedOrbitMapHubs(activeNode.id, nodeById, connectionIndex)
        : [],
    [activeNode, connectionIndex, nodeById]
  );

  return (
    <aside
      className={cn(
        variant === "overlay" &&
          cn(
            "pointer-events-auto flex flex-col overflow-x-hidden overflow-y-auto rounded-sm border bg-popover p-4 animate-orbit-slide-in-right [scrollbar-width:thin]",
            appOverlayPanelClassName,
            orbitHairlineBorder()
          ),
        variant === "dock" &&
          "map-glass pointer-events-auto flex h-full flex-col overflow-x-hidden overflow-y-auto rounded-sm p-4 animate-orbit-slide-in-right [scrollbar-width:thin]",
        variant === "rail" &&
          "surface-inset-strong flex min-w-0 w-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin] lg:w-[300px] lg:shrink-0 xl:w-[320px]",
        className
      )}
    >
      <SelectedClusterBody
        node={activeNode}
        stats={data.stats}
        focusedBookmark={focusedBookmark}
        focusedBookmarkLoading={focusedBookmarkLoading}
        hasExplicitSelection={Boolean(selection)}
        selectedBookmarkId={selectedBookmarkId}
        armedBookmark={armedBookmark}
        connected={connected}
        sharedHubs={sharedHubs}
        onAssign={onAssign}
        onAddTag={onAddTag}
        onAddToCollection={onAddToCollection}
        onCopyAsCollection={onCopyAsCollection}
        onOpenBookmark={onOpenBookmark}
        onSelectNode={onSelectNode}
        onSelectHub={onSelectHub}
        onClearSelection={onClearSelection}
        copyingCollectionId={copyingCollectionId}
        priorityMedia={variant === "rail"}
      />
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
  armedBookmark: OrbitMapArmedBookmark | null;
  connected: OrbitGraphNode[];
  sharedHubs: Array<{ node: OrbitMapHubNode; count: number }>;
  onAssign: () => void;
  onAddTag: () => void;
  onAddToCollection: () => void;
  onCopyAsCollection: (collectionId: string) => void;
  onOpenBookmark: (bookmarkId: string) => void;
  onSelectNode?: (bookmarkId: string) => void;
  onSelectHub?: (hub: { kind: "tag" | "collection"; id: string }) => void;
  onClearSelection: () => void;
  copyingCollectionId?: string | null;
  priorityMedia: boolean;
}

/** "60 on the map · 30 more in Bookmarks" for a hub whose cluster is capped. */
function onMapMeta(total: number, connected: OrbitGraphNode[]) {
  const onMap = connected.filter((n) => n.kind === "bookmark").length;
  const more = Math.max(0, total - onMap);
  return more > 0
    ? `${onMap.toLocaleString()} on the map · ${more.toLocaleString()} more in Bookmarks`
    : pluralize(onMap, "bookmark");
}

function SelectedClusterBody({
  node,
  stats,
  focusedBookmark,
  focusedBookmarkLoading,
  hasExplicitSelection,
  selectedBookmarkId,
  armedBookmark,
  connected,
  sharedHubs,
  onAssign,
  onAddTag,
  onAddToCollection,
  onCopyAsCollection,
  onOpenBookmark,
  onSelectNode,
  onSelectHub,
  onClearSelection,
  copyingCollectionId,
  priorityMedia,
}: SelectedClusterBodyProps) {
  const onClose = hasExplicitSelection ? onClearSelection : undefined;
  const openFromList = onSelectNode ?? onOpenBookmark;

  if (!node) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium text-foreground">Select something on the map</p>
        <p className="text-sm text-muted-foreground">
          Click a tag, collection, or bookmark to see details and give it a home.
        </p>
      </div>
    );
  }

  if (node.kind === "core") {
    return (
      <div className="min-w-0 space-y-3">
        <InspectorHeader
          icon={<OrbitLogoMark className="size-3.5 text-primary" />}
          kicker="Orbit"
          title="Orbit queue"
          count={stats.looseBookmarks}
          meta={`Loose bookmarks waiting for a home · ${pluralize(stats.totalBookmarks, "bookmark")} in your library`}
          onClose={onClose}
        />
        <ConnectedList
          title="Loose bookmarks"
          nodes={connected}
          onOpenBookmark={openFromList}
          link={{ href: "/orbit", label: "Open the queue" }}
        />
      </div>
    );
  }

  if (node.kind === "tag") {
    const assigned = Boolean(armedBookmark?.assigned);
    return (
      <div className="min-w-0 space-y-3">
        <InspectorHeader
          icon={<TagDot name={node.name} color={node.color} size={10} />}
          kicker="Tag"
          title={node.name}
          count={node.count}
          meta={onMapMeta(node.count, connected)}
          onClose={onClose}
        />
        {armedBookmark ? <ArmedBookmarkRow bookmark={armedBookmark} /> : null}
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Button
            size="sm"
            className="h-9 min-w-0 justify-center gap-1.5 px-2"
            onClick={onAssign}
            disabled={!selectedBookmarkId || assigned}
            title={
              !selectedBookmarkId
                ? "Select a bookmark on the map first"
                : assigned && armedBookmark
                  ? `@${armedBookmark.authorUsername} is already tagged #${node.name}`
                  : undefined
            }
          >
            {assigned ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <Crosshair className="size-4 shrink-0" />
            )}
            <span className="min-w-0 truncate">
              {assigned ? "Tagged" : `Assign to ${node.name}`}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-9 min-w-0 justify-center gap-1.5 px-2", orbitGhostButtonClass())}
            onClick={onAddTag}
            disabled={!selectedBookmarkId}
            title={!selectedBookmarkId ? "Select a bookmark on the map first" : undefined}
          >
            <TagIcon className="size-4 shrink-0" />
            Edit tags
          </Button>
        </div>
        {!selectedBookmarkId ? (
          <p className="text-xs text-muted-foreground">
            Select a bookmark on the map, or drag one onto this hub.
          </p>
        ) : null}
        <SharedHubsRow hubs={sharedHubs} onSelectHub={onSelectHub} />
        <ConnectedList
          title="Bookmarks"
          nodes={connected}
          onOpenBookmark={openFromList}
          link={{
            href: `/dashboard?tag=${encodeURIComponent(node.id)}`,
            label: "Open in Bookmarks",
          }}
        />
      </div>
    );
  }

  if (node.kind === "collection") {
    const isXFolder = node.variant === "x_folder";
    const Icon = isXFolder ? FolderOpen : Folder;
    const actionState = getOrbitCollectionActionState(node, selectedBookmarkId);
    const isCopying = copyingCollectionId === node.id;
    const assigned = Boolean(armedBookmark?.assigned);
    return (
      <div className="min-w-0 space-y-3">
        <InspectorHeader
          icon={<Icon className="size-3.5 text-muted-foreground" />}
          kicker={isXFolder ? "X folder" : "Collection"}
          title={node.name}
          count={node.count}
          meta={onMapMeta(node.count, connected)}
          onClose={onClose}
        />
        {actionState.readOnlyReason ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {actionState.readOnlyReason}
          </p>
        ) : null}
        {armedBookmark && actionState.canAssign ? (
          <ArmedBookmarkRow bookmark={armedBookmark} />
        ) : null}
        {actionState.canCopyAsCollection ? (
          <Button
            size="sm"
            className="h-9 w-full justify-center gap-1.5 px-2"
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
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Button
              size="sm"
              className="h-9 min-w-0 justify-center gap-1.5 px-2"
              onClick={onAssign}
              disabled={!actionState.canAssign || assigned}
              title={
                !actionState.canAssign
                  ? (actionState.readOnlyReason ?? "Select a bookmark on the map first")
                  : assigned && armedBookmark
                    ? `@${armedBookmark.authorUsername} is already in ${node.name}`
                    : undefined
              }
            >
              {assigned ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <Crosshair className="size-4 shrink-0" />
              )}
              <span className="min-w-0 truncate">
                {assigned ? "Collected" : `Assign to ${node.name}`}
              </span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn("h-9 min-w-0 justify-center gap-1.5 px-2", orbitGhostButtonClass())}
              onClick={onAddToCollection}
              disabled={!actionState.canCollect}
              title={
                !actionState.canCollect
                  ? (actionState.readOnlyReason ?? "Select a bookmark on the map first")
                  : undefined
              }
            >
              <Folder className="size-4 shrink-0" />
              Collections
            </Button>
          </div>
        )}
        {!selectedBookmarkId && !actionState.readOnlyReason ? (
          <p className="text-xs text-muted-foreground">
            Select a bookmark on the map, or drag one onto this hub.
          </p>
        ) : null}
        <SharedHubsRow hubs={sharedHubs} onSelectHub={onSelectHub} />
        <ConnectedList
          title="Bookmarks"
          nodes={connected}
          onOpenBookmark={openFromList}
          link={
            isXFolder
              ? undefined
              : {
                  href: `/dashboard?collection=${encodeURIComponent(node.id)}`,
                  label: "Open in Bookmarks",
                }
          }
        />
      </div>
    );
  }

  if (node.kind === "bookmark") {
    const tagConnections = connected.filter(
      (n): n is Extract<OrbitGraphNode, { kind: "tag" }> => n.kind === "tag"
    );
    const collectionConnections = connected.filter(
      (n): n is Extract<OrbitGraphNode, { kind: "collection" }> => n.kind === "collection"
    );
    const isLoose = tagConnections.length === 0 && collectionConnections.length === 0;
    const hasMedia = Boolean(focusedBookmark?.media?.length);
    const status = isLoose
      ? "Loose — not tagged or collected yet"
      : [
          tagConnections.length > 0 ? pluralize(tagConnections.length, "tag") : null,
          collectionConnections.length > 0
            ? pluralize(collectionConnections.length, "collection")
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

    return (
      <div className="min-w-0 space-y-3">
        <InspectorHeader
          icon={<GrokMark className="size-3.5 text-muted-foreground" title="Grok" />}
          kicker="Bookmark"
          title={`@${node.authorUsername}`}
          meta={status}
          onClose={onClose}
        />

        <div className="grid min-w-0 grid-cols-2 gap-2 min-[420px]:grid-cols-3">
          <Button
            size="sm"
            variant="outline"
            className={cn("h-9 min-w-0 justify-center gap-1.5 px-2", orbitGhostButtonClass())}
            onClick={onAddTag}
          >
            <TagIcon className="size-4" />
            Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("h-9 min-w-0 justify-center gap-1.5 px-2", orbitGhostButtonClass())}
            onClick={onAddToCollection}
          >
            <Folder className="size-4" />
            Collect
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 min-w-0 justify-center gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenBookmark(node.id)}
          >
            <Maximize2 className="size-4" />
            Open
          </Button>
        </div>

        {!isLoose ? (
          <div className={sectionClass}>
            <p className={orbitLabelClass()}>On the map</p>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {tagConnections.map((t) => (
                <HubChip
                  key={t.id}
                  label={t.name}
                  icon={<TagDot name={t.name} color={t.color} size={10} />}
                  onClick={onSelectHub ? () => onSelectHub({ kind: "tag", id: t.id }) : undefined}
                />
              ))}
              {collectionConnections.map((c) => (
                <HubChip
                  key={c.id}
                  label={c.name}
                  icon={<CollectionGlyph />}
                  onClick={
                    onSelectHub ? () => onSelectHub({ kind: "collection", id: c.id }) : undefined
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        {focusedBookmarkLoading && !focusedBookmark ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : focusedBookmark ? (
          <div className={cn(sectionClass, "overflow-x-hidden")}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className={orbitLabelClass()}>Post</p>
              {hasMedia ? (
                <span className="text-xs text-muted-foreground">Media attached</span>
              ) : null}
            </div>
            <BookmarkPostPreview
              tweetText={focusedBookmark.tweetText}
              authorUsername={focusedBookmark.authorUsername}
              media={focusedBookmark.media}
              urls={focusedBookmark.urls}
              tweetLink={{
                authorUsername: focusedBookmark.authorUsername,
                tweetId: focusedBookmark.tweetId,
              }}
              bookmarkKey={focusedBookmark.id}
              variant="inline"
              priorityMedia={priorityMedia}
              className="min-w-0"
              textClassName="min-w-0 break-words line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-muted-foreground"
              galleryClassName="!mt-2 min-w-0 w-full border-hairline-soft/70"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{node.title}</p>
        )}
      </div>
    );
  }

  return null;
}

/** Kind, name, count, one line of context, and a close button. */
function InspectorHeader({
  icon,
  kicker,
  title,
  count,
  meta,
  onClose,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
  count?: number;
  meta?: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-flex shrink-0 items-center">{icon}</span>
          {kicker}
        </p>
        <p className="flex min-w-0 items-baseline gap-2 text-lg font-semibold leading-tight text-foreground">
          <span className="min-w-0 truncate">{title}</span>
          {count !== undefined ? (
            <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground">
              {count.toLocaleString()}
            </span>
          ) : null}
        </p>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {onClose ? (
        <Button
          size="icon-sm"
          variant="ghost"
          className="-mr-1 -mt-1 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close inspector"
          title="Close (Esc)"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function CollectionGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5 shrink-0 text-muted-foreground" aria-hidden>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}

/** Other homes that share bookmarks with the selected hub. */
function SharedHubsRow({
  hubs,
  onSelectHub,
}: {
  hubs: Array<{ node: OrbitMapHubNode; count: number }>;
  onSelectHub?: (hub: { kind: "tag" | "collection"; id: string }) => void;
}) {
  if (hubs.length === 0) return null;
  return (
    <div className={sectionClass}>
      <p className={orbitLabelClass()}>Shares bookmarks with</p>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {hubs.map(({ node, count }) => (
          <HubChip
            key={node.id}
            label={node.name}
            count={count}
            icon={
              node.kind === "tag" ? (
                <TagDot name={node.name} color={node.color} size={10} />
              ) : (
                <CollectionGlyph />
              )
            }
            onClick={onSelectHub ? () => onSelectHub({ kind: node.kind, id: node.id }) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** A tag/collection chip; clicking flies to that hub. */
function HubChip({
  label,
  icon,
  count,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  count?: number;
  onClick?: () => void;
}) {
  const className =
    "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border border-hairline-soft px-2 py-1 text-xs text-foreground";
  const content = (
    <>
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </>
  );
  if (!onClick) return <span className={className}>{content}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Go to ${label}`}
      className={cn(
        className,
        "transition-colors hover:bg-hover focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
      )}
    >
      {content}
    </button>
  );
}

/** Names the bookmark a hub's Assign will act on. */
function ArmedBookmarkRow({ bookmark }: { bookmark: OrbitMapArmedBookmark }) {
  return (
    <div className={cn(sectionClass, "space-y-0")}>
      <p className={orbitLabelClass()}>Selected bookmark</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">
        @{bookmark.authorUsername}
      </p>
      {bookmark.text ? (
        <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
          {bookmark.text}
        </p>
      ) : null}
    </div>
  );
}

const CONNECTED_LIST_PAGE = 50;
/** Two-line rows: past this many, the list scrolls instead of growing. */
const CONNECTED_LIST_SCROLL_AFTER = 4;

function ConnectedList({
  title,
  nodes,
  onOpenBookmark,
  link,
}: {
  title: string;
  nodes: OrbitGraphNode[];
  onOpenBookmark: (bookmarkId: string) => void;
  link?: { href: string; label: string };
}) {
  const bookmarks = nodes.filter(
    (n): n is Extract<OrbitGraphNode, { kind: "bookmark" }> => n.kind === "bookmark"
  );
  const listKey = `${title}:${bookmarks.length}:${bookmarks[0]?.id ?? ""}`;
  const [visibleCount, setVisibleCount] = useState(CONNECTED_LIST_PAGE);
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (prevListKey !== listKey) {
    setPrevListKey(listKey);
    setVisibleCount(CONNECTED_LIST_PAGE);
  }

  if (bookmarks.length === 0) return null;

  const visible = bookmarks.slice(0, visibleCount);
  const remaining = bookmarks.length - visible.length;

  return (
    <div className={sectionClass}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={orbitLabelClass()}>
          {title}{" "}
          <span className="font-mono tabular-nums">
            {visible.length < bookmarks.length
              ? `${visible.length} of ${bookmarks.length}`
              : bookmarks.length}
          </span>
        </p>
        {link ? (
          <Link
            href={link.href}
            className="shrink-0 rounded-sm text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {/* Short lists size to their rows; long ones scroll in a fixed well. */}
      <ScrollArea
        className={cn(
          "min-w-0 surface-inset",
          bookmarks.length > CONNECTED_LIST_SCROLL_AFTER && "h-56"
        )}
      >
        <ul className="divide-y divide-hairline-soft">
          {visible.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpenBookmark(b.id)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
              >
                <span
                  className={cn(
                    "mt-1.5 inline-block size-1.5 shrink-0 rounded-full",
                    b.affiliated ? "bg-muted-foreground" : "bg-primary"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    @{b.authorUsername}
                  </span>
                  {b.title ? (
                    <span className="block truncate text-muted-foreground">{b.title}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + CONNECTED_LIST_PAGE)}
            className="flex w-full items-center justify-center border-t border-hairline-soft px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
          >
            Show {Math.min(CONNECTED_LIST_PAGE, remaining)} more
          </button>
        ) : null}
      </ScrollArea>
    </div>
  );
}
