import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { TagWithCount } from "@/types";

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
  return (
    <div
      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
        index > 0 ? "border-t border-hairline-soft" : ""
      }`}
    >
      <div
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="flex-1 text-sm font-medium">{tag.name}</span>
      <span className="rounded-full border border-hairline-soft bg-surface-1 px-2 py-0.5 text-xs text-muted-foreground shadow-sm">
        {tag._count?.bookmarks ?? 0}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:bg-surface-1 hover:text-foreground"
        onClick={() => onStartEdit(tag)}
      >
        Edit
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:bg-destructive/10"
        aria-label={`Delete tag ${tag.name}`}
        onClick={() => onDelete(tag.id)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
});
