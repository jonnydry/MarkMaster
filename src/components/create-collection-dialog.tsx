"use client";

import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  const fieldId = useId();

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
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            Create a themed home for related bookmarks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${fieldId}-name`} className="mb-1.5">
              Name
            </Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              maxLength={80}
              onKeyDown={(e) =>
                e.key === "Enter" && void handleCreate()
              }
            />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-description`} className="mb-1.5">
              Description
            </Label>
            <Textarea
              id={`${fieldId}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this collection about?"
              className="resize-none"
              rows={3}
              maxLength={280}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={`${fieldId}-public`}>Public</Label>
              <p className="text-xs text-muted-foreground">
                Public collections get a shareable link.
              </p>
            </div>
            <Switch
              id={`${fieldId}-public`}
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || submitting}>
            {submitting ? "Creating…" : "Create collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
