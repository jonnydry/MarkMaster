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
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TagWithCount, CollectionWithCount } from "@/types";

interface SidebarProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
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
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] border-r border-sidebar-border bg-sidebar flex flex-col h-full">
      <div className="px-4 pt-7 pb-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
          <div className="w-[26px] h-[26px] rounded-md bg-primary flex items-center justify-center">
            <Bookmark className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-[17px] tracking-tight text-foreground">
            MarkMaster
          </span>
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <nav className="px-4 space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] transition-colors ${
                pathname === href || (href === "/dashboard" && pathname === "/")
                  ? "bg-primary/8 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {tags.length > 0 && (
          <div className="px-4 pt-6">
            <h3 className="px-3 mb-2 text-[11px] font-semibold text-zinc-600 uppercase tracking-[0.08em]">
              Tags
            </h3>
            <div className="space-y-0.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => onTagToggle(tag.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                    selectedTags.includes(tag.id)
                      ? "bg-primary/8 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span className="truncate">{tag.name}</span>
                  <span className="ml-auto text-[11px] text-zinc-600">
                    {tag._count.bookmarks}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 pt-6 pb-3">
          <div className="flex items-center justify-between px-3 mb-2">
            <h3 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-[0.08em]">
              Collections
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-zinc-500 hover:text-muted-foreground"
              onClick={onCreateCollection}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {collections.length === 0 ? (
            <p className="px-3 text-[11px] text-zinc-600">
              No collections yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {collections.map((col) => (
                <Link
                  key={col.id}
                  href={`/collections/${col.id}`}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                    pathname === `/collections/${col.id}`
                      ? "bg-primary/8 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span className="truncate">{col.name}</span>
                  <span className="ml-auto text-[11px] text-zinc-600">
                    {col._count.items}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
