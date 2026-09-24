import React from "react";
import { GitMerge, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagDot } from "@/components/tag-dot";
import { cn } from "@/lib/utils";
import type { TagWithCount } from "@/types";

interface TagRowProps {
  tag: TagWithCount;
  index: number;
  mergeTargets: TagWithCount[];
  onStartEdit: (tag: TagWithCount) => void;
  onDelete: (tagId: string) => void;
  onMerge: (sourceTagId: string, targetTagId: string) => void;
}

export const TagRow = React.memo(function TagRow({
  tag,
  index,
  mergeTargets,
  onStartEdit,
  onDelete,
  onMerge,
}: TagRowProps) {
  const count = tag._count?.bookmarks ?? 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1/80",
        index > 0 && "border-t border-hairline-soft"
      )}
    >
      <TagDot
        name={tag.name}
        color={tag.color}
        size={14}
        className="shrink-0 ring-1 ring-hairline-soft ring-offset-1 ring-offset-surface-2"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{tag.name}</p>
        <p className="text-xs text-muted-foreground">
          {count.toLocaleString()} {count === 1 ? "bookmark" : "bookmarks"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {mergeTargets.length > 0 ? (
          <Popover>
            <PopoverTrigger
              aria-label={`Merge tag ${tag.name} into another tag`}
              className="inline-flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              <GitMerge className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-56 p-1"
            >
              <p className="px-2 py-1.5 text-xs font-medium tracking-[0.08em] text-muted-foreground">
                Merge into
              </p>
              <div className="max-h-48 overflow-y-auto">
                {mergeTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                    onClick={() => onMerge(tag.id, target.id)}
                  >
                    <TagDot name={target.name} color={target.color} size={10} />
                    <span className="min-w-0 truncate">{target.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:bg-hover hover:text-foreground"
          aria-label={`Edit tag ${tag.name}`}
          onClick={() => onStartEdit(tag)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:bg-destructive/10"
          aria-label={`Delete tag ${tag.name}`}
          onClick={() => onDelete(tag.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
});
