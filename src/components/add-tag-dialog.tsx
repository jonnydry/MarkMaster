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
import type { TagWithCount } from "@/types";

const PRESET_COLORS = [
  "#1d9bf0",
  "#71717a",
  "#52525b",
  "#3f3f46",
  "#a1a1aa",
  "#27272a",
  "#d4d4d8",
  "#18181b",
];

interface AddTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkId: string | null;
  existingTags: TagWithCount[];
  onAddTag: (bookmarkId: string, name: string, color: string) => void;
  onRemoveTag: (bookmarkId: string, tagId: string) => void;
  bookmarkTags: string[];
}

export function AddTagDialog({
  open,
  onOpenChange,
  bookmarkId,
  existingTags,
  onAddTag,
  onRemoveTag,
  bookmarkTags,
}: AddTagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const handleAdd = () => {
    if (!name.trim() || !bookmarkId) return;
    onAddTag(bookmarkId, name.trim(), color);
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {existingTags.length > 0 && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Existing tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {existingTags.map((tag) => {
                  const isApplied = bookmarkTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                        isApplied
                          ? "bg-primary/12 text-primary font-medium"
                          : "bg-card text-[#52525b] border border-border hover:text-foreground"
                      }`}
                      onClick={() => {
                        if (!bookmarkId) return;
                        if (isApplied) onRemoveTag(bookmarkId, tag.id);
                        else onAddTag(bookmarkId, tag.name, tag.color);
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
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
