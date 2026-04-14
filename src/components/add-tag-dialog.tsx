"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const isBulk = bookmarkIds.length > 1;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
      setColor(PRESET_COLORS[0]);
    }
    onOpenChange(nextOpen);
  };

  const handleAdd = () => {
    if (!name.trim() || bookmarkIds.length === 0) return;
    onAddTag(bookmarkIds, name.trim(), color);
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Tag ${bookmarkIds.length} bookmarks` : "Manage Tags"}
          </DialogTitle>
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
                  return (
                    <button
                      key={tag.id}
                      className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                        isApplied
                          ? "bg-primary/10 text-primary"
                          : "bg-card text-muted-foreground border border-border hover:text-foreground"
                      }`}
                      onClick={() => {
                        if (bookmarkIds.length === 0) return;
                        if (isApplied) onRemoveTag(bookmarkIds, tag.id);
                        else onAddTag(bookmarkIds, tag.name, tag.color);
                      }}
                    >
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
              <Button onClick={handleAdd} disabled={!name.trim()}>
                Add
              </Button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
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
