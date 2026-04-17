"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  FolderOpen,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import type { TagWithCount, CollectionWithCount } from "@/types";
import { useSidebar } from "@/components/sidebar-provider";
import { SyncButton } from "@/components/sync-button";
import { MarkMasterLogo } from "@/components/markmaster-logo";

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

  return (
    <aside
      className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-hairline-strong bg-gradient-to-b from-sidebar to-surface-1 py-3 transition-[width,padding] duration-300 ease-out motion-reduce:transition-none ${
        expanded ? "w-64 px-3" : "w-[60px] items-center px-1.5"
      }`}
    >
      <button
        type="button"
        onClick={showToggle ? toggle : undefined}
        className={`group mb-3 flex items-center rounded-xl border border-transparent transition-colors hover:border-hairline-soft hover:bg-sidebar-accent ${
          expanded ? "h-10 gap-2.5 self-stretch px-2" : "h-10 w-10 justify-center"
        }`}
        title={expanded ? "Collapse sidebar" : "MarkMaster"}
      >
        <MarkMasterLogo width={28} height={28} className="shrink-0" priority />
        {expanded && (
          <span className="text-[15px] font-bold tracking-[-0.02em] text-sidebar-foreground heading-font">
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
              }${expanded ? " h-9 gap-3" : " h-9 w-9 justify-center"}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {expanded && <span className="text-sm font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {expanded ? (
        <>
          {/* Scroll only tags/collections; footer stays fixed so flex+sticky cannot inflate scroll height / overscroll. */}
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-y-contain scrollbar-thin">
            <div className="space-y-4 pb-1">
              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tags
                  </h3>
                </div>
                {tags.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    Tags appear as you add them to bookmarks
                  </p>
                ) : (
                  <div className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain scrollbar-thin pr-0.5">
                    {tags.map((tag) => {
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
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    My Collections
                  </h3>
                  <button
                    type="button"
                    onClick={onCreateCollection}
                    aria-label="Create collection"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span aria-hidden>+</span>
                  </button>
                </div>
                {!hasCollections ? (
                  <p className="px-1 text-xs text-muted-foreground/70">
                    Create a collection to start curating
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {userCollections.map((collection) => {
                        const isCollectionActive = pathname === `/collections/${collection.id}`;
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
                  </div>
                )}
              </div>

              {xFolders.length > 0 && (
                <div>
                  <div className="mb-2 px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      X Folders
                    </h3>
                  </div>
                  <div className="space-y-0.5">
                    {xFolders.map((collection) => {
                        const isCollectionActive = pathname === `/collections/${collection.id}`;
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
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto shrink-0 space-y-2 border-t border-hairline-strong bg-gradient-to-t from-surface-1 via-surface-1 to-transparent pt-3">
            {showToggle && (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                aria-label="Collapse sidebar"
                className="flex h-9 w-full shrink-0 items-center gap-3 px-3 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="text-xs">Collapse</span>
              </button>
            )}
            <div className="w-full self-stretch">
              <SyncButton
                lastSyncAt={lastSyncAt ?? null}
                onSyncComplete={onSyncComplete}
                bookmarkCount={totalBookmarks}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1" aria-hidden />
          {showToggle && (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={expanded}
              aria-label="Expand sidebar"
              className="mx-auto mt-2 flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          )}
        </>
      )}
    </aside>
  );
}
