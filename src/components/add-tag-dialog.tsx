"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { PRESET_COLORS } from "@/lib/constants";
import type { TagWithCount } from "@/types";

interface AddTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkIds: string[];
  existingTags: TagWithCount[];
  onAddTag: (bookmarkIds: string[], name: string, color: string) => void | Promise<void>;
  onRemoveTag: (bookmarkIds: string[], tagId: string) => void | Promise<void>;
  bookmarkTags: string[];
}

export function AddTagDialog({
  open,
  onOpenChange,
  bookmarkIds,
  existingTags,
  onAddTag,
  onRemoveTag,
  bookmarkTags,
}: AddTagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [pendingTagId, setPendingTagId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const isBulk = bookmarkIds.length > 1;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
      setColor(PRESET_COLORS[0]);
      setPendingTagId(null);
      setAddingNew(false);
    }
    onOpenChange(nextOpen);
  };

  const handleAdd = async () => {
    if (!name.trim() || bookmarkIds.length === 0) return;
    setAddingNew(true);
    try {
      await onAddTag(bookmarkIds, name.trim(), color);
      setName("");
    } finally {
      setAddingNew(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Tag ${bookmarkIds.length} bookmarks` : "Manage Tags"}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? "Apply or remove tags across the selected bookmarks."
              : "Apply existing tags or create a new one for this bookmark."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isBulk && (
            <p className="text-sm text-muted-foreground">
              Apply or remove tags across the selected bookmarks.
            </p>
          )}
          {existingTags.length > 0 && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Existing tags
              </label>
              <div className="max-h-40 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {existingTags.map((tag) => {
                  const isApplied = bookmarkTags.includes(tag.id);
                  const isPending = pendingTagId === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={isApplied}
                      disabled={isPending || pendingTagId !== null}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
                        isApplied
                          ? "bg-primary/10 text-primary"
                          : "bg-card text-muted-foreground border border-border hover:text-foreground"
                      }`}
                      onClick={async () => {
                        if (bookmarkIds.length === 0) return;
                        setPendingTagId(tag.id);
                        try {
                          if (isApplied) await onRemoveTag(bookmarkIds, tag.id);
                          else await onAddTag(bookmarkIds, tag.name, tag.color);
                        } finally {
                          setPendingTagId(null);
                        }
                      }}
                    >
                      {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
          )}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Create new tag
            </label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tag name"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <Button onClick={handleAdd} disabled={!name.trim() || addingNew || pendingTagId !== null}>
                {addingNew && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Add
              </Button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select color ${c}`}
                  aria-pressed={color === c}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    color === c ? "scale-125 ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
