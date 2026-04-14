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
import { FolderOpen, Plus, Check } from "lucide-react";
import type { CollectionWithCount } from "@/types";

interface AddToCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkIds: string[];
  collections: CollectionWithCount[];
  bookmarkCollections: string[];
  onAddToCollection: (bookmarkIds: string[], collectionId: string) => void | Promise<void>;
  onCreateCollection: (name: string) => Promise<string>;
}

export function AddToCollectionDialog({
  open,
  onOpenChange,
  bookmarkIds,
  collections,
  bookmarkCollections,
  onAddToCollection,
  onCreateCollection,
}: AddToCollectionDialogProps) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const isBulk = bookmarkIds.length > 1;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setNewName("");
    }
    onOpenChange(nextOpen);
  };

  const handleCreate = async () => {
    if (!newName.trim() || bookmarkIds.length === 0) return;
    setCreating(true);
    try {
      const id = await onCreateCollection(newName.trim());
      await onAddToCollection(bookmarkIds, id);
      setNewName("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBulk
              ? `Add ${bookmarkIds.length} bookmarks to a collection`
              : "Add to Collection"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {collections.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {collections.map((col) => {
                const isIn = bookmarkCollections.includes(col.id);
                const isManaged = col.type === "x_folder";
                return (
                  <button
                    key={col.id}
onClick={async () => {
                      if (bookmarkIds.length === 0 || isIn || isManaged) return;
                      try {
                        await onAddToCollection(bookmarkIds, col.id);
                      } catch {
                        // error handled by caller toast
                      }
                    }}
                    disabled={isIn || isManaged}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      isIn
                        ? "bg-primary/10 text-primary"
                        : isManaged
                          ? "bg-muted/60 text-muted-foreground cursor-not-allowed"
                          : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 shrink-0" />
                    <span className="truncate">{col.name}</span>
                    {isManaged && (
                      <span className="text-[10px] uppercase tracking-wide text-primary">
                        Sync
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {col._count.items}
                    </span>
                    {isIn && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection name"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
