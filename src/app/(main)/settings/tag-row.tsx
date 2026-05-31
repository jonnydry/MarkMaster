import React from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TagWithCount } from "@/types";
import { TagDot } from "@/components/tag-dot";

interface TagRowProps {
  tag: TagWithCount;
  index: number;
  onStartEdit: (tag: TagWithCount) => void;
  onDelete: (tagId: string) => void;
}

export const TagRow = React.memo(function TagRow({
  tag,
  index,
  onStartEdit,
  onDelete,
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
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
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
