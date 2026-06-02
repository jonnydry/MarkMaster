"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarkId: string | null;
  existingNoteId?: string;
  existingNote?: string;
  onSave: (bookmarkId: string, content: string) => Promise<void> | void;
  onDelete?: (noteId: string) => Promise<void> | void;
}

function NoteForm({
  bookmarkId,
  existingNoteId,
  existingNote,
  onSave,
  onDelete,
  onCancel,
}: {
  bookmarkId: string;
  existingNoteId?: string;
  existingNote?: string;
  onSave: (bookmarkId: string, content: string) => Promise<void> | void;
  onDelete?: (noteId: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(existingNote || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSave(bookmarkId, content.trim());
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingNoteId || !onDelete) return;

    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;

    setDeleting(true);
    try {
      await onDelete(existingNoteId);
    } finally {
      setDeleting(false);
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
        disabled={busy}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {existingNoteId && onDelete ? (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
            className="justify-center gap-1.5 sm:justify-start"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete note
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!content.trim() || busy}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AddNoteDialog({
  open,
  onOpenChange,
  bookmarkId,
  existingNoteId,
  existingNote,
  onSave,
  onDelete,
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
            existingNoteId={existingNoteId}
            existingNote={existingNote}
            onSave={async (id, content) => {
              await onSave(id, content);
              onOpenChange(false);
            }}
            onDelete={onDelete ? async (noteId) => {
              await onDelete(noteId);
              onOpenChange(false);
            } : undefined}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
