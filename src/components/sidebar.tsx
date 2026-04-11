"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  FolderOpen,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { TagWithCount, CollectionWithCount } from "@/types";
import { useSidebar } from "@/components/sidebar-provider";
import { SyncButton } from "@/components/sync-button";

interface SidebarProps {
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

  return (
    <aside
      suppressHydrationWarning
      className={`flex h-full shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/70 py-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-xl backdrop-saturate-150 transition-[width,padding] duration-300 ease-out motion-reduce:transition-none dark:bg-sidebar/45 dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)] ${
        expanded ? "w-64 px-3" : "w-[60px] items-center px-1.5"
      }`}
    >
      <Link
        href="/dashboard"
        className={`group mb-6 flex items-center ${
          expanded ? "h-10 gap-2.5 self-stretch rounded-xl px-2" : "h-10 w-10 justify-center"
        }`}
        title="MarkMaster"
      >
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-primary-foreground">M</span>
          </div>
          {expanded && (
            <span className="text-[15px] font-bold tracking-[-0.02em] text-sidebar-foreground">
              MarkMaster
            </span>
          )}
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center rounded-lg transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              } ${expanded ? "h-9 gap-3 px-3" : "h-10 w-10 justify-center"}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {expanded && <span className="text-sm font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {expanded ? (
        <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto scrollbar-thin">
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Tags
                </h3>
              </div>
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No tags yet</p>
              ) : (
                <div className="space-y-0.5">
                  {tags.slice(0, 8).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onTagToggle(tag.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                        selectedTags.includes(tag.id)
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate">{tag.name}</span>
                      </span>
                      <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground/50">
                        {tag._count.bookmarks}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Collections
                </h3>
                <button
                  type="button"
                  onClick={onCreateCollection}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-sm leading-none text-muted-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground"
                >
                  +
                </button>
              </div>
              {collections.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No collections yet</p>
              ) : (
                <div className="space-y-0.5">
                  {collections.map((collection) => {
                    const isCollectionActive = pathname === `/collections/${collection.id}`;
                    return (
                      <Link
                        key={collection.id}
                        href={`/collections/${collection.id}`}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
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
              )}
            </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1" aria-hidden />
      )}

      {showToggle && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className={`mt-2 flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground ${
            expanded ? "h-9 gap-3 px-3" : "mx-auto h-10 w-10 justify-center"
          }`}
        >
          {expanded ? (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="text-xs">Collapse</span>
            </>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
        </button>
      )}

      {expanded && (
        <div className="mt-2 w-full shrink-0 self-stretch">
          <SyncButton
            lastSyncAt={lastSyncAt ?? null}
            onSyncComplete={onSyncComplete}
            bookmarkCount={totalBookmarks}
          />
        </div>
      )}
    </aside>
  );
}
