"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { PRESET_COLORS, getColorName } from "@/lib/constants";
import { highlightActiveClass, highlightIdleClass, highlightInteractiveClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";
import { getBalancedTagColor } from "@/lib/tag-colors";
import { MAX_TAG_NAME_LENGTH } from "@/lib/validations";
import { useTypography } from "@/hooks/use-typography";
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
  const t = useTypography();
  const [name, setName] = useState("");
  const suggestedColor = useMemo(
    () => getBalancedTagColor(name, existingTags),
    [existingTags, name]
  );
  const [manualColor, setManualColor] = useState<string | null>(null);
  const color = manualColor ?? suggestedColor;
  const colorOptions = useMemo(
    () => (PRESET_COLORS.includes(color) ? PRESET_COLORS : [color, ...PRESET_COLORS]),
    [color]
  );
  const [pendingTagIds, setPendingTagIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [addingNew, setAddingNew] = useState(false);
  const isBulk = bookmarkIds.length > 1;

  const query = name.trim().toLowerCase();
  const filteredTags = useMemo(() => {
    if (!query) return existingTags;
    return existingTags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [existingTags, query]);
  const exactMatch = useMemo(
    () => existingTags.find((tag) => tag.name.toLowerCase() === query),
    [existingTags, query]
  );
  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && !exactMatch;
  const createButtonLabel = trimmedName
    ? `Create “${trimmedName}”`
    : "Create";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
      setManualColor(null);
      setPendingTagIds(new Set());
      setAddingNew(false);
    }
    onOpenChange(nextOpen);
  };

  const toggleTag = async (tag: TagWithCount, isApplied: boolean) => {
    if (bookmarkIds.length === 0 || pendingTagIds.has(tag.id)) return;
    setPendingTagIds((prev) => new Set(prev).add(tag.id));
    try {
      if (isApplied) await onRemoveTag(bookmarkIds, tag.id);
      else await onAddTag(bookmarkIds, tag.name, tag.color);
    } finally {
      setPendingTagIds((prev) => {
        const next = new Set(prev);
        next.delete(tag.id);
        return next;
      });
    }
  };

  const handleAdd = async () => {
    if (!canCreate || bookmarkIds.length === 0) return;
    setAddingNew(true);
    try {
      await onAddTag(bookmarkIds, trimmedName, color);
      setName("");
      setManualColor(null);
    } finally {
      setAddingNew(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="min-w-0 overflow-x-hidden sm:max-w-md">
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
        <div className="min-w-0 space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              existingTags.length > 0 ? "Filter tags or create new…" : "Tag name"
            }
            aria-label={
              existingTags.length > 0
                ? "Filter tags or enter a new tag name"
                : "Tag name"
            }
            maxLength={MAX_TAG_NAME_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (exactMatch) {
                void toggleTag(exactMatch, bookmarkTags.includes(exactMatch.id));
              } else {
                void handleAdd();
              }
            }}
          />
          {existingTags.length > 0 && (
            <div>
              <p className={t.sectionLabel}>Existing tags</p>
              <div className="max-h-40 overflow-y-auto">
                {filteredTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {filteredTags.map((tag) => {
                      const isApplied = bookmarkTags.includes(tag.id);
                      const isPending = pendingTagIds.has(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          aria-pressed={isApplied}
                          disabled={isPending}
                          className={cn(
                            "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                            isApplied
                              ? highlightActiveClass
                              : cn(
                                  highlightIdleClass,
                                  highlightInteractiveClass,
                                  "border-hairline-soft"
                                )
                          )}
                          onClick={() => void toggleTag(tag, isApplied)}
                        >
                          {isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: tag.color }}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 truncate">{tag.name}</span>
                          {isApplied && !isPending && (
                            <Check className="h-3 w-3" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-1 text-xs text-muted-foreground">
                    No tags match &ldquo;
                    <span className="break-all">{trimmedName}</span>
                    &rdquo;.
                  </p>
                )}
              </div>
            </div>
          )}
          {(canCreate || existingTags.length === 0) && (
            <div className="min-w-0 space-y-3">
              <p className={t.sectionLabel}>Create new tag</p>
              <div className="flex flex-wrap gap-1.5">
                {colorOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Select color ${getColorName(c)}`}
                    aria-pressed={color === c}
                    className={cn(
                      "h-6 w-6 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                      color === c
                        ? "border-primary/50 ring-2 ring-ring/45"
                        : "border-hairline-soft"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      setManualColor(c);
                    }}
                  />
                ))}
              </div>
              <Button
                type="button"
                className="w-full min-w-0 shrink"
                onClick={handleAdd}
                disabled={!canCreate || addingNew}
                aria-label={
                  trimmedName ? `Create tag “${trimmedName}”` : "Create tag"
                }
              >
                {addingNew && (
                  <Loader2 className="mr-1 h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                <span className="truncate">{createButtonLabel}</span>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
