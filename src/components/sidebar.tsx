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
import { formatDistanceToNow } from "date-fns";

interface SidebarProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  lastSyncAt?: Date | null;
  totalBookmarks?: number;
}

const NAV_ITEMS = [
  { href: "/dashboard", icon: Bookmark, label: "Bookmarks" },
  { href: "/collections", icon: FolderOpen, label: "Collections" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

function SyncStatusBlock({ lastSyncAt, totalBookmarks }: { lastSyncAt?: Date | null; totalBookmarks?: number }) {
  const label = lastSyncAt
    ? `Last sync ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}`
    : "Never synced";
  const count = totalBookmarks !== undefined ? ` · ${totalBookmarks.toLocaleString()} bookmarks` : "";

  return (
    <div className="mt-auto rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${lastSyncAt ? "bg-success" : "bg-muted-foreground/40"}`}
        />
        <span className="text-xs text-muted-foreground">
          {lastSyncAt ? "Up to date" : "Not synced"}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground/60">
        {label}{count}
      </div>
    </div>
  );
}

export function Sidebar({
  tags,
  collections,
  selectedTags,
  onTagToggle,
  onCreateCollection,
  expanded = false,
  onExpandedChange,
  lastSyncAt,
  totalBookmarks,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`border-r border-sidebar-border bg-sidebar flex flex-col h-full py-4 ${
        expanded ? "w-64 px-3" : "w-[60px] items-center"
      }`}
    >
      <Link
        href="/dashboard"
        className={`flex items-center mb-6 group ${
          expanded ? "h-10 px-2 gap-2.5 self-stretch rounded-xl" : "w-10 h-10 justify-center"
        }`}
        title="MarkMaster"
      >
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-1.5">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
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
              className={`rounded-lg flex items-center transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              } ${expanded ? "h-9 px-3 gap-3" : "w-10 h-10 justify-center"}`}
            >
              <Icon className="w-[18px] h-[18px]" />
              {expanded && <span className="text-sm font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {onExpandedChange && (
        <button
          onClick={() => onExpandedChange(!expanded)}
          className={`mt-auto flex items-center transition-colors text-muted-foreground hover:text-foreground ${
            expanded
              ? "h-9 px-3 gap-3"
              : "w-10 h-10 justify-center mx-auto"
          }`}
        >
          {expanded ? (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      )}

      {expanded && (
        <>
          <div className="mt-6 flex-1 overflow-y-auto scrollbar-thin space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
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
                      onClick={() => onTagToggle(tag.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                        selectedTags.includes(tag.id)
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate">{tag.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground/50 ml-2 font-mono tabular-nums">
                        {tag._count.bookmarks}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                  Collections
                </h3>
                <button
                  onClick={onCreateCollection}
                  className="text-muted-foreground/50 hover:text-muted-foreground text-sm leading-none w-5 h-5 flex items-center justify-center transition-colors rounded-md hover:bg-sidebar-accent"
                >
                  +
                </button>
              </div>
              {collections.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  No collections yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {collections.map((collection) => {
                    const isCollectionActive = pathname === `/collections/${collection.id}`;
                    return (
                      <Link
                        key={collection.id}
                        href={`/collections/${collection.id}`}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                          isCollectionActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="w-4 h-4 shrink-0" />
                          <span className="truncate">{collection.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground/50 ml-2 font-mono tabular-nums">
                          {collection._count.items}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <SyncStatusBlock lastSyncAt={lastSyncAt} totalBookmarks={totalBookmarks} />
        </>
      )}
    </aside>
  );
}