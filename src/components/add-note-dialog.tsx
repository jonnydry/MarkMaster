"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSave(bookmarkId, content.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Why did you bookmark this? Add context for your future self..."
        className="min-h-[120px] resize-none"
        disabled={saving}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!content.trim() || saving}>
          {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
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
          <DialogDescription>
            {existingNote
              ? "Update your note for this bookmark."
              : "Add context or reminders for your future self."}
          </DialogDescription>
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
