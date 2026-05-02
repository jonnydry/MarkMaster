import { Tag, FolderPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SelectionToolbarProps {
  selectedCount: number;
  onSelectPage: () => void;
  onClear: () => void;
  onTag: () => void;
  onAddToCollection: () => void;
  onHide: () => void;
}

export function SelectionToolbar({
  selectedCount,
  onSelectPage,
  onClear,
  onTag,
  onAddToCollection,
  onHide,
}: SelectionToolbarProps) {
  return (
    <div className="animate-slide-down-fade flex flex-wrap items-center justify-between gap-2 bg-secondary/50 px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">
          {selectedCount > 0
            ? `${selectedCount} selected`
            : "Select bookmarks to apply bulk actions"}
        </span>
        <Button variant="outline" size="sm" className="h-10 px-3 text-sm" onClick={onSelectPage}>
          Select page
        </Button>
        {selectedCount > 0 && (
          <Button variant="ghost" size="sm" className="h-10 px-3 text-sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5 px-3 text-sm"
          disabled={selectedCount === 0}
          onClick={onTag}
        >
          <Tag className="size-4" />
          Tag
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5 px-3 text-sm"
          disabled={selectedCount === 0}
          onClick={onAddToCollection}
        >
          <FolderPlus className="size-4" />
          Add to Collection
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5 px-3 text-sm text-destructive hover:text-destructive"
          disabled={selectedCount === 0}
          onClick={() => void onHide()}
        >
          <Trash2 className="size-4" />
          Hide
        </Button>
      </div>
    </div>
  );
}
