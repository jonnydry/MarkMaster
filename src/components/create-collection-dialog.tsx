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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateCollection: (
    name: string,
    description: string,
    isPublic: boolean
  ) => void | Promise<void>;
}

export function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreateCollection,
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreateCollection(name.trim(), description.trim(), isPublic);
      setName("");
      setDescription("");
      setIsPublic(false);
      onOpenChange(false);
    } catch {
      /* parent shows error via toast */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Collection</DialogTitle>
          <DialogDescription>
            Create a themed home for related bookmarks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              onKeyDown={(e) =>
                e.key === "Enter" && void handleCreate()
              }
            />
          </div>
          <div>
            <Label className="mb-1.5">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this collection about?"
              className="resize-none"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Public</Label>
              <p className="text-xs text-muted-foreground">
                Public collections get a shareable link
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || submitting}
            >
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
