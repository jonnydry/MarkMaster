"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  FolderOpen,
  Network,
  Plus,
  Settings,
} from "lucide-react";
import type { TagWithCount, CollectionWithCount } from "@/types";
import { useSidebar } from "@/components/sidebar-provider";
import { SidebarSection } from "@/components/sidebar-section";
import { SyncButton } from "@/components/sync-button";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { hasFeedPageWatermark } from "@/lib/feed-page-watermark";
import { cn } from "@/lib/utils";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { TagDot } from "@/components/tag-dot";
import { useTypography } from "@/hooks/use-typography";
import { prefetchOrbitGraph } from "@/hooks/use-orbit-graph";
import { useTagsQuery, useCollectionsQuery } from "@/hooks/use-library-data";

const TAG_PREVIEW_LIMIT = 12;
const COLLECTION_PREVIEW_LIMIT = 10;
const X_FOLDER_PREVIEW_LIMIT = 8;

/** Placeholder rows shown while the tag/collection index is still loading. */
function SidebarSkeletonRows({
  rows = 5,
  withDot = false,
}: {
  rows?: number;
  withDot?: boolean;
}) {
  const widths = ["72%", "58%", "66%", "45%", "62%", "50%"];
  return (
    <div className="space-y-1 px-1 pb-1" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1">
          {withDot ? (
            <span className="skeleton-shimmer h-1.5 w-1.5 shrink-0 rounded-full" />
          ) : (
            <span className="skeleton-shimmer size-4 shrink-0 rounded-[2px]" />
          )}
          <span
            className="skeleton-shimmer h-3 rounded-[2px]"
            style={{ width: widths[i % widths.length] }}
          />
        </div>
      ))}
    </div>
  );
}

function isSidebarInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a, button, input, select, textarea, label, [role='button'], [role='menuitem'], [role='link'], [data-sidebar-no-toggle]"
    )
  );
}

export interface SidebarProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
  /** Mobile drawer: full layout and hide collapse control. */
  forceExpanded?: boolean;
  lastSyncAt?: Date | null;
  totalBookmarks?: number;
  onSyncComplete?: () => void;
  onSyncStateChange?: (syncing: boolean) => void;
}

const NAV_ITEMS = [
  { href: "/dashboard", icon: Bookmark, label: "Bookmarks" },
  { href: "/orbit", icon: OrbitLogoMark, label: "Orbit" },
  { href: "/orbit/map", icon: Network, label: "Graph" },
  { href: "/collections", icon: FolderOpen, label: "Collections" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar({
  tags,
  collections,
  selectedTags,
  onTagToggle,
  onCreateCollection,
  forceExpanded = false,
  lastSyncAt,
  totalBookmarks,
  onSyncComplete,
  onSyncStateChange,
}: SidebarProps) {
  const t = useTypography();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const prefetchGraph = useCallback(() => {
    prefetchOrbitGraph(queryClient);
  }, [queryClient]);
  const glassSidebar = hasFeedPageWatermark(pathname);
  const { expanded: ctxExpanded, toggle } = useSidebar();
  const expanded = forceExpanded ? true : ctxExpanded;
  const showToggle = !forceExpanded;
  const userCollections = useMemo(
    () => collections.filter((collection) => collection.type !== "x_folder"),
    [collections]
  );
  const xFolders = useMemo(
    () => collections.filter((collection) => collection.type === "x_folder"),
    [collections]
  );
  const hasCollections = userCollections.length > 0 || xFolders.length > 0;

  // Distinguish "still loading" from "genuinely empty" so a cold load shows
  // skeletons, not the zero-state copy (which reads as data loss). These
  // subscribe to the same cached queries the page already runs — no extra fetch.
  const { isLoading: tagsQueryLoading } = useTagsQuery();
  const { isLoading: collectionsQueryLoading } = useCollectionsQuery();
  const tagsLoading = tagsQueryLoading && tags.length === 0;
  const collectionsLoading = collectionsQueryLoading && !hasCollections;

  const [showAllTags, setShowAllTags] = useState(false);
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [showAllFolders, setShowAllFolders] = useState(false);

  const visibleTags = showAllTags ? tags : tags.slice(0, TAG_PREVIEW_LIMIT);
  const hiddenTagCount = tags.length - visibleTags.length;
  const visibleCollections = showAllCollections
    ? userCollections
    : userCollections.slice(0, COLLECTION_PREVIEW_LIMIT);
  const hiddenCollectionCount = userCollections.length - visibleCollections.length;
  const visibleFolders = showAllFolders
    ? xFolders
    : xFolders.slice(0, X_FOLDER_PREVIEW_LIMIT);
  const hiddenFolderCount = xFolders.length - visibleFolders.length;

  const handleAsideBackgroundClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!showToggle) return;
      if (isSidebarInteractiveTarget(event.target)) return;
      toggle();
    },
    [showToggle, toggle]
  );

  return (
    <aside
      onClick={showToggle ? handleAsideBackgroundClick : undefined}
      aria-label={showToggle ? "Sidebar navigation" : undefined}
      className={cn(
        "sidebar-embedded flex h-full min-h-0 shrink-0 flex-col overflow-hidden py-3 transition-[width,padding,background-color] duration-300 ease-out motion-reduce:transition-none",
        glassSidebar && "sidebar-embedded-glass",
        expanded ? "w-64 px-3" : "w-[60px] items-center px-1.5",
        showToggle && "cursor-default"
      )}
    >
      <button
        type="button"
        onClick={showToggle ? toggle : undefined}
        className={`group mb-4 flex cursor-pointer items-center rounded-sm border border-transparent transition-colors hover:border-sidebar-border hover:bg-accent-soft/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 ${
          expanded
            ? "min-h-12 gap-3 self-stretch px-2 py-1"
            : "size-12 justify-center"
        }`}
        title={expanded ? "MarkMaster — hide sidebar" : "MarkMaster — show sidebar"}
      >
        <MarkMasterLogo width={40} height={40} className="shrink-0" priority decorative />
        {expanded && (
          <span className="text-lg font-bold tracking-[-0.02em] text-sidebar-foreground heading-font">
            MarkMaster
          </span>
        )}
      </button>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              onMouseEnter={href === "/orbit/map" ? prefetchGraph : undefined}
              onFocus={href === "/orbit/map" ? prefetchGraph : undefined}
              className={cn(
                "flex items-center rounded-sm border border-transparent transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
                isActive
                  ? "menu-selection-active font-semibold"
                  : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground",
                expanded ? "h-10 gap-3 px-2.5" : "h-10 w-10 justify-center"
              )}
            >
              <Icon
                className="size-5 shrink-0"
              />
              {expanded && (
                <span className={cn(t.bodyStrong, "leading-none")}>{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {expanded ? (
        <>
          {/* Outer scroll handles overflow; sections are collapsible and individually truncated via "Show all". */}
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-y-contain scrollbar-thin">
            <div className="space-y-4 pb-1">
              <SidebarSection id="tags" title="Tags" count={tags.length}>
                {tags.length === 0 ? (
                  tagsLoading ? (
                    <SidebarSkeletonRows rows={6} withDot />
                  ) : (
                    <p className="px-1 pb-1 text-xs text-muted-foreground">
                      Tags appear as you add them to bookmarks
                    </p>
                  )
                ) : (
                  <div className="space-y-0.5">
                    {visibleTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => onTagToggle(tag.id)}
                          aria-pressed={isSelected}
                          className={`flex w-full items-center justify-between rounded-sm border border-transparent px-2.5 py-1 text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 ${
                            isSelected
                              ? "menu-selection-active font-semibold [&_.sidebar-item-count]:text-primary/70"
                              : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <TagDot
                              name={tag.name}
                              color={tag.color}
                              size={6}
                              className={`shrink-0 transition-transform motion-reduce:transition-none ${
                                isSelected ? "ring-2 ring-primary/25 scale-110" : ""
                              }`}
                            />
                            <span className="truncate">{tag.name}</span>
                          </span>
                          <span className={cn("sidebar-item-count ml-2 text-xs text-muted-foreground/50", t.data)}>
                            {tag._count.bookmarks}
                          </span>
                        </button>
                      );
                    })}
                    {(hiddenTagCount > 0 || showAllTags) && (
                      <button
                        type="button"
                        onClick={() => setShowAllTags((v) => !v)}
                        className="flex w-full items-center justify-between rounded-sm border border-transparent px-2.5 py-1 text-xs font-semibold text-muted-foreground/70 transition-colors hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                      >
                        <span>
                          {showAllTags ? "Show less" : `Show all ${tags.length}`}
                        </span>
                        {!showAllTags && hiddenTagCount > 0 && (
                          <span className={cn(t.data, "text-muted-foreground/40")}>
                            +{hiddenTagCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </SidebarSection>

              <SidebarSection
                id="collections"
                title="My Collections"
                count={userCollections.length}
                action={
                  <button
                    type="button"
                    onClick={onCreateCollection}
                    aria-label="Create collection"
                    className="flex h-6 w-6 items-center justify-center rounded-sm border border-hairline-soft text-muted-foreground/60 transition-colors hover:border-primary/35 hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                }
              >
                {!hasCollections ? (
                  collectionsLoading ? (
                    <SidebarSkeletonRows rows={4} />
                  ) : (
                    <p className="px-1 pb-1 text-xs text-muted-foreground/70">
                      Create a collection to start curating
                    </p>
                  )
                ) : (
                  <div className="space-y-0.5">
                    {visibleCollections.map((collection) => {
                      const isCollectionActive =
                        pathname === `/collections/${collection.id}`;
                      return (
                        <Link
                          key={collection.id}
                          href={`/collections/${collection.id}`}
                          className={`flex w-full items-center justify-between rounded-sm border border-transparent px-2.5 py-1 text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 ${
                            isCollectionActive
                              ? "menu-selection-active font-semibold [&_.sidebar-item-count]:text-primary/70"
                              : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <FolderOpen className="h-4 w-4 shrink-0" />
                            <span className="truncate">{collection.name}</span>
                          </span>
                          <span className={cn("sidebar-item-count ml-2 text-xs text-muted-foreground/50", t.data)}>
                            {collection._count.items}
                          </span>
                        </Link>
                      );
                    })}
                    {(hiddenCollectionCount > 0 || showAllCollections) && (
                      <button
                        type="button"
                        onClick={() => setShowAllCollections((v) => !v)}
                        className="flex w-full items-center justify-between rounded-sm border border-transparent px-2.5 py-1 text-xs font-semibold text-muted-foreground/70 transition-colors hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                      >
                        <span>
                          {showAllCollections
                            ? "Show less"
                            : `Show all ${userCollections.length}`}
                        </span>
                        {!showAllCollections && hiddenCollectionCount > 0 && (
                          <span className={cn(t.data, "text-muted-foreground/40")}>
                            +{hiddenCollectionCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </SidebarSection>

              {xFolders.length > 0 && (
                <SidebarSection
                  id="x-folders"
                  title="X Folders"
                  count={xFolders.length}
                >
                  <div className="space-y-0.5">
                    {visibleFolders.map((collection) => {
                      const isCollectionActive =
                        pathname === `/collections/${collection.id}`;
                      return (
                        <Link
                          key={collection.id}
                          href={`/collections/${collection.id}`}
                          className={`flex w-full items-center justify-between rounded-sm border border-transparent px-2.5 py-1 text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 ${
                            isCollectionActive
                              ? "menu-selection-active font-semibold [&_.sidebar-item-count]:text-primary/70"
                              : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <FolderOpen className="h-4 w-4 shrink-0" />
                            <span className="truncate">{collection.name}</span>
                          </span>
                          <span className={cn("sidebar-item-count ml-2 text-xs text-muted-foreground/50", t.data)}>
                            {collection._count.items}
                          </span>
                        </Link>
                      );
                    })}
                    {(hiddenFolderCount > 0 || showAllFolders) && (
                      <button
                        type="button"
                        onClick={() => setShowAllFolders((v) => !v)}
                        className="flex w-full items-center justify-between rounded-sm border border-transparent px-2.5 py-1 text-xs font-semibold text-muted-foreground/70 transition-colors hover:border-hairline-soft hover:bg-accent-soft/50 hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                      >
                        <span>
                          {showAllFolders
                            ? "Show less"
                            : `Show all ${xFolders.length}`}
                        </span>
                        {!showAllFolders && hiddenFolderCount > 0 && (
                          <span className={cn(t.data, "text-muted-foreground/40")}>
                            +{hiddenFolderCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </SidebarSection>
              )}
            </div>
          </div>

          <div className="mt-auto shrink-0 space-y-2 border-t border-sidebar-border pt-3">
            <div className="w-full self-stretch" data-sidebar-no-toggle>
              <SyncButton
                lastSyncAt={lastSyncAt ?? null}
                onSyncComplete={onSyncComplete}
                onSyncStateChange={onSyncStateChange}
                bookmarkCount={totalBookmarks}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1" aria-hidden />
          <div
            className="mt-auto shrink-0 border-t border-sidebar-border pt-3"
            data-sidebar-no-toggle
          >
            <SyncButton
              lastSyncAt={lastSyncAt ?? null}
              onSyncComplete={onSyncComplete}
              onSyncStateChange={onSyncStateChange}
              bookmarkCount={totalBookmarks}
              layout="icon"
            />
          </div>
        </>
      )}
    </aside>
  );
}
