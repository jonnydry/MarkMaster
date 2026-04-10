"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  FolderOpen,
  BarChart3,
  Settings,
  Tag,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TagWithCount, CollectionWithCount } from "@/types";

interface SidebarProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
  expanded?: boolean;
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
  expanded = false,
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
          expanded ? "h-10 px-2 gap-2.5 self-stretch" : "w-10 h-10 justify-center"
        }`}
        title="MarkMaster"
      >
        <Bookmark className="w-6 h-6 text-primary" />
        {expanded && (
          <span className="text-[15px] font-bold tracking-[-0.03em] text-foreground">
            MarkMaster
          </span>
        )}
      </Link>

      <nav className="flex flex-col gap-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href === "/dashboard" && pathname === "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`rounded-xl flex items-center transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              } ${expanded ? "h-10 px-3 gap-3" : "w-10 h-10 justify-center"}`}
            >
              <Icon className="w-5 h-5" />
              {expanded && <span className="text-sm font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {expanded && (
        <div className="mt-6 flex-1 overflow-y-auto space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Tags
              </h3>
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            {tags.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">No tags yet</p>
            ) : (
              <div className="space-y-1">
                {tags.slice(0, 8).map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => onTagToggle(tag.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedTags.includes(tag.id)
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono tabular-nums">
                      {tag._count.bookmarks}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Collections
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={onCreateCollection}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {collections.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                No collections yet
              </p>
            ) : (
              <div className="space-y-1">
                {collections.map((collection) => {
                  const isCollectionActive = pathname === `/collections/${collection.id}`;
                  return (
                    <Link
                      key={collection.id}
                      href={`/collections/${collection.id}`}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        isCollectionActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FolderOpen className="w-4 h-4 shrink-0" />
                        <span className="truncate">{collection.name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono tabular-nums">
                        {collection._count.items}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
