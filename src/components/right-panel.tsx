"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TagWithCount, CollectionWithCount } from "@/types";

interface RightPanelProps {
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  onCreateCollection: () => void;
}

export function RightPanel({
  tags,
  collections,
  selectedTags,
  onTagToggle,
  onCreateCollection,
}: RightPanelProps) {
  const pathname = usePathname();
  const topTags = [...tags]
    .sort((a, b) => b._count.bookmarks - a._count.bookmarks)
    .slice(0, 8);

  return (
    <aside className="w-[280px] border-l border-border bg-sidebar flex flex-col h-full overflow-hidden">
      <div className="p-4 space-y-6 overflow-y-auto flex-1">
        {topTags.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Top Tags
            </h3>
            <div className="space-y-1">
              {topTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => onTagToggle(tag.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTags.includes(tag.id)
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {tag._count.bookmarks}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
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
            <p className="text-xs text-muted-foreground px-3">
              No collections yet
            </p>
          ) : (
            <div className="space-y-1">
              {collections.map((col) => {
                const isActive = pathname === `/collections/${col.id}`;
                return (
                  <Link
                    key={col.id}
                    href={`/collections/${col.id}`}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      <span className="truncate">{col.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {col._count.items}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
