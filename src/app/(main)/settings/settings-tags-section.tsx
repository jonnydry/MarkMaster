"use client";

import { type RefObject } from "react";
import { Loader2, Palette, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TagEditRow } from "./tag-edit-row";
import { TagRow } from "./tag-row";
import { SettingsSection } from "./settings-primitives";
import type { useSettingsTags } from "@/hooks/use-settings-tags";

type SettingsTagsSectionProps = ReturnType<typeof useSettingsTags> & {
  tagSearchRef: RefObject<HTMLInputElement | null>;
};

function TagListSkeleton() {
  return (
    <div className="space-y-0 rounded-sm border border-hairline-soft">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 px-4 py-3",
            i > 0 && "border-t border-hairline-soft"
          )}
        >
          <div className="size-3.5 rounded-full skeleton-shimmer" />
          <div className="h-3 w-24 flex-1 rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

export function SettingsTagsSection({
  tags,
  tagsLoading,
  tagSearch,
  setTagSearch,
  tagSearchRef,
  editingTag,
  editTagName,
  editTagColor,
  balancingTagColors,
  balancedTagColorUpdates,
  filteredTags,
  handleDeleteTag,
  handleUpdateTag,
  handleStartEdit,
  handleCancelEdit,
  handleBalanceTagColors,
}: SettingsTagsSectionProps) {
  return (
    <SettingsSection
      id="tags"
      icon={Tag}
      title="Tags"
      description="Rename, recolor, or balance tags across your library."
      action={
        tags.length > 1 ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-hairline-soft"
            onClick={handleBalanceTagColors}
            disabled={balancingTagColors || balancedTagColorUpdates.length === 0}
          >
            {balancingTagColors ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Palette className="size-3.5" />
            )}
            Balance colors
          </Button>
        ) : null
      }
    >
      {tags.length > 0 ? (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={tagSearchRef}
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="Search tags…"
            className="h-9 border-hairline-soft bg-surface-2 pl-9"
            aria-label="Search tags"
          />
        </div>
      ) : null}

      {tagsLoading ? (
        <TagListSkeleton />
      ) : tags.length === 0 ? (
        <div className="rounded-sm border border-dashed border-hairline-soft px-4 py-10 text-center">
          <Tag className="mx-auto mb-2 size-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No tags yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tags appear here as you organize bookmarks on the dashboard.
          </p>
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="rounded-sm border border-hairline-soft px-4 py-6 text-center text-sm text-muted-foreground">
          No tags match &ldquo;{tagSearch.trim()}&rdquo;
        </div>
      ) : (
        <div className="max-h-[min(28rem,50vh)] overflow-y-auto rounded-sm border border-hairline-soft bg-surface-2/50">
          {filteredTags.map((tag, index) =>
            editingTag === tag.id ? (
              <TagEditRow
                key={tag.id}
                tag={tag}
                index={index}
                initialName={editTagName}
                initialColor={editTagColor}
                onSave={handleUpdateTag}
                onCancel={handleCancelEdit}
              />
            ) : (
              <TagRow
                key={tag.id}
                tag={tag}
                index={index}
                onStartEdit={handleStartEdit}
                onDelete={handleDeleteTag}
              />
            )
          )}
        </div>
      )}

      {!tagsLoading && tags.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {filteredTags.length.toLocaleString()} of {tags.length.toLocaleString()} tags
          {tagSearch.trim() ? " shown" : ""}
        </p>
      ) : null}
    </SettingsSection>
  );
}
