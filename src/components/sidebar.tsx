"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, FolderOpen, BarChart3, Settings, Layers } from "lucide-react";
import type { TagWithCount, CollectionWithCount } from "@/types";
import { useSidebar } from "@/components/sidebar-provider";
import { SidebarSection } from "@/components/sidebar-section";
import { SyncButton } from "@/components/sync-button";
import { MarkMasterLogo } from "@/components/markmaster-logo";

const TAG_PREVIEW_LIMIT = 12;
const COLLECTION_PREVIEW_LIMIT = 10;
const X_FOLDER_PREVIEW_LIMIT = 8;

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
}

const NAV_ITEMS = [
  { href: "/dashboard", icon: Bookmark, label: "Bookmarks" },
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
}: SidebarProps) {
  const pathname = usePathname();
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
      aria-label={
        showToggle
          ? "Sidebar navigation. Click an empty area to show or hide the sidebar."
          : undefined
      }
      className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-hairline-strong bg-gradient-to-b from-sidebar to-surface-1 py-3 transition-[width,padding] duration-300 ease-out motion-reduce:transition-none ${
        expanded ? "w-64 px-3" : "w-[60px] items-center px-1.5"
      } ${showToggle ? "cursor-col-resize" : ""}`}
    >
      <button
        type="button"
        onClick={showToggle ? toggle : undefined}
        className={`group mb-3 flex cursor-pointer items-center rounded-xl border border-transparent transition-colors hover:border-hairline-soft hover:bg-sidebar-accent ${
          expanded
            ? "min-h-12 gap-3 self-stretch px-2 py-1"
            : "size-12 justify-center"
        }`}
        title={expanded ? "MarkMaster — hide sidebar" : "MarkMaster — show sidebar"}
      >
        <MarkMasterLogo width={40} height={40} className="shrink-0" priority />
        {expanded && (
          <span className="text-lg font-bold tracking-[-0.02em] text-sidebar-foreground heading-font">
            MarkMaster
          </span>
        )}
      </button>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                isActive
                  ? "bg-primary/10 text-primary font-medium border-l-2 border-l-primary -ml-[2px] pl-[calc(0.75rem+2px)]"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }${expanded ? " h-10 gap-3" : " h-10 w-10 justify-center"}`}
            >
              <Icon className="size-5 shrink-0" />
              {expanded && (
                <span className="text-[15px] font-medium leading-none">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {expanded ? (
        <>
          {/* Outer scroll handles overflow; sections are collapsible and individually truncated via "Show all". */}
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-y-contain scrollbar-thin">
            <div className="space-y-3 pb-1">
              <SidebarSection id="tags" title="Tags" count={tags.length}>
                {tags.length === 0 ? (
                  <p className="px-1 pb-1 text-xs text-muted-foreground">
                    Tags appear as you add them to bookmarks
                  </p>
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
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                            isSelected
                              ? "bg-primary/10 text-foreground font-medium"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden
                              className={`h-2 w-2 shrink-0 rounded-full transition-transform ${
                                isSelected ? "ring-2 ring-primary/30 scale-110" : ""
                              }`}
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="truncate">{tag.name}</span>
                          </span>
                          <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground/50">
                            {tag._count.bookmarks}
                          </span>
                        </button>
                      );
                    })}
                    {(hiddenTagCount > 0 || showAllTags) && (
                      <button
                        type="button"
                        onClick={() => setShowAllTags((v) => !v)}
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <span>
                          {showAllTags ? "Show less" : `Show all ${tags.length}`}
                        </span>
                        {!showAllTags && hiddenTagCount > 0 && (
                          <span className="font-mono tabular-nums text-muted-foreground/40">
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
                    className="flex h-6 w-6 items-center justify-center rounded-md text-base leading-none text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span aria-hidden>+</span>
                  </button>
                }
              >
                {!hasCollections ? (
                  <p className="px-1 pb-1 text-xs text-muted-foreground/70">
                    Create a collection to start curating
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {visibleCollections.map((collection) => {
                      const isCollectionActive =
                        pathname === `/collections/${collection.id}`;
                      return (
                        <Link
                          key={collection.id}
                          href={`/collections/${collection.id}`}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1 text-sm transition-colors ${
                            isCollectionActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Layers className="h-4 w-4 shrink-0" />
                            <span className="truncate">{collection.name}</span>
                          </span>
                          <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground/50">
                            {collection._count.items}
                          </span>
                        </Link>
                      );
                    })}
                    {(hiddenCollectionCount > 0 || showAllCollections) && (
                      <button
                        type="button"
                        onClick={() => setShowAllCollections((v) => !v)}
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <span>
                          {showAllCollections
                            ? "Show less"
                            : `Show all ${userCollections.length}`}
                        </span>
                        {!showAllCollections && hiddenCollectionCount > 0 && (
                          <span className="font-mono tabular-nums text-muted-foreground/40">
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
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1 text-sm transition-colors ${
                            isCollectionActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <FolderOpen className="h-4 w-4 shrink-0" />
                            <span className="truncate">{collection.name}</span>
                          </span>
                          <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground/50">
                            {collection._count.items}
                          </span>
                        </Link>
                      );
                    })}
                    {(hiddenFolderCount > 0 || showAllFolders) && (
                      <button
                        type="button"
                        onClick={() => setShowAllFolders((v) => !v)}
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <span>
                          {showAllFolders
                            ? "Show less"
                            : `Show all ${xFolders.length}`}
                        </span>
                        {!showAllFolders && hiddenFolderCount > 0 && (
                          <span className="font-mono tabular-nums text-muted-foreground/40">
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

          <div className="mt-auto shrink-0 space-y-2 border-t border-hairline-strong bg-gradient-to-t from-surface-1 via-surface-1 to-transparent pt-3">
            <div className="w-full self-stretch" data-sidebar-no-toggle>
              <SyncButton
                lastSyncAt={lastSyncAt ?? null}
                onSyncComplete={onSyncComplete}
                bookmarkCount={totalBookmarks}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1" aria-hidden />
      )}
    </aside>
  );
}
