"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkId: string | null;
  existingNote?: string;
  onSave: (bookmarkId: string, content: string) => void;
}

function NoteForm({
  bookmarkId,
  existingNote,
  onSave,
  onCancel,
}: {
  bookmarkId: string;
  existingNote?: string;
  onSave: (bookmarkId: string, content: string) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(existingNote || "");

  const handleSave = () => {
    if (!content.trim()) return;
    onSave(bookmarkId, content.trim());
  };

  return (
    <div className="space-y-4">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Why did you bookmark this? Add context for your future self..."
        className="min-h-[120px] resize-none"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!content.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function AddNoteDialog({
  open,
  onOpenChange,
  bookmarkId,
  existingNote,
  onSave,
}: AddNoteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existingNote ? "Edit Note" : "Add Note"}
          </DialogTitle>
        </DialogHeader>
        {bookmarkId && (
          <NoteForm
            key={bookmarkId + (existingNote || "")}
            bookmarkId={bookmarkId}
            existingNote={existingNote}
            onSave={(id, content) => {
              onSave(id, content);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
