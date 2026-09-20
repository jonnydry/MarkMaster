"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { sendJson } from "@/lib/fetch-json";
import { invalidateTagsQuery } from "@/lib/query-invalidation";
import {
  findCaseDuplicateTagGroups,
  pickCanonicalTag,
} from "@/lib/tag-merge-groups";
import { assignBalancedTagColors } from "@/lib/tag-colors";
import { toast } from "@/lib/toast";
import { useTagsQuery } from "@/hooks/use-library-data";

export function useSettingsTags() {
  const queryClient = useQueryClient();
  const {
    data: tags = [],
    isLoading: tagsLoading,
    isError: tagsError,
    error: tagsErrorValue,
    refetch: refetchTags,
  } = useTagsQuery();

  const [tagSearch, setTagSearch] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagColor, setEditTagColor] = useState("");
  const [balancingTagColors, setBalancingTagColors] = useState(false);

  const balancedTags = useMemo(() => assignBalancedTagColors(tags), [tags]);
  const balancedTagColorUpdates = useMemo(
    () =>
      balancedTags.filter((tag, index) => tag.color !== tags[index]?.color),
    [balancedTags, tags]
  );

  const duplicateTagGroups = useMemo(
    () => findCaseDuplicateTagGroups(tags),
    [tags]
  );

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [tagSearch, tags]);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    const confirmed = await confirmDialog({
      title: "Delete this tag?",
      description: "It will be removed from all bookmarks.",
      confirmLabel: "Delete tag",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await sendJson("/api/tags", {
        method: "DELETE",
        body: { tagId },
      });
      await invalidateTagsQuery(queryClient);
      toast.success("Tag deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete tag"
      );
    }
  }, [queryClient]);

  const handleUpdateTag = useCallback(async (tagId: string, name: string, color: string) => {
    try {
      await sendJson("/api/tags", {
        method: "PATCH",
        body: { tagId, name, color },
      });
      await invalidateTagsQuery(queryClient);
      setEditingTag(null);
      toast.success("Tag updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update tag"
      );
    }
  }, [queryClient]);

  const applyMerge = useCallback(
    async (sourceTagId: string, targetTagId: string) => {
      const source = tags.find((tag) => tag.id === sourceTagId);
      const target = tags.find((tag) => tag.id === targetTagId);
      await sendJson("/api/tags/merge", {
        method: "POST",
        body: { sourceTagId, targetTagId },
      });
      await Promise.all([
        invalidateTagsQuery(queryClient),
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
        queryClient.invalidateQueries({ queryKey: ["library-stats"] }),
      ]);
      setEditingTag(null);
      toast.success(
        `Merged ${source?.name ?? "tag"} into ${target?.name ?? "tag"}`
      );
    },
    [queryClient, tags]
  );

  const handleMergeTags = useCallback(
    async (sourceTagId: string, targetTagId: string) => {
      const source = tags.find((tag) => tag.id === sourceTagId);
      const target = tags.find((tag) => tag.id === targetTagId);
      const confirmed = await confirmDialog({
        title: `Merge “${source?.name ?? "tag"}” into “${target?.name ?? "tag"}”?`,
        description:
          "Bookmarks keep the destination tag. The source tag is removed.",
        confirmLabel: "Merge tags",
      });
      if (!confirmed) return;
      try {
        await applyMerge(sourceTagId, targetTagId);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not merge tags"
        );
      }
    },
    [applyMerge, tags]
  );

  const handleMergeDuplicateGroup = useCallback(
    async (group: typeof tags) => {
      const canonical = pickCanonicalTag(group);
      const sources = group.filter((tag) => tag.id !== canonical.id);
      const confirmed = await confirmDialog({
        title: `Keep “${canonical.name}” and merge the rest?`,
        description: `${sources
          .map((tag) => tag.name)
          .join(", ")} will be removed. Bookmarks keep ${canonical.name}.`,
        confirmLabel: "Merge duplicates",
      });
      if (!confirmed) return;
      try {
        for (const source of sources) {
          await applyMerge(source.id, canonical.id);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not merge tags"
        );
      }
    },
    [applyMerge]
  );

  const handleStartEdit = useCallback((tag: { id: string; name: string; color: string }) => {
    setEditingTag(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTag(null);
  }, []);

  const handleBalanceTagColors = useCallback(async () => {
    if (balancedTagColorUpdates.length === 0) {
      toast.message("Tag colors already look balanced");
      return;
    }

    setBalancingTagColors(true);
    try {
      await Promise.all(
        balancedTagColorUpdates.map((tag) =>
          sendJson("/api/tags", {
            method: "PATCH",
            body: { tagId: tag.id, color: tag.color },
          })
        )
      );
      await invalidateTagsQuery(queryClient);
      setEditingTag(null);
      toast.success(
        `Balanced ${balancedTagColorUpdates.length} tag color${
          balancedTagColorUpdates.length === 1 ? "" : "s"
        }`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not balance tag colors"
      );
    } finally {
      setBalancingTagColors(false);
    }
  }, [balancedTagColorUpdates, queryClient]);

  return {
    tags,
    tagsLoading,
    tagsError,
    tagsErrorValue,
    refetchTags,
    tagSearch,
    setTagSearch,
    editingTag,
    editTagName,
    editTagColor,
    balancingTagColors,
    balancedTagColorUpdates,
    filteredTags,
    duplicateTagGroups,
    handleDeleteTag,
    handleMergeTags,
    handleMergeDuplicateGroup,
    handleUpdateTag,
    handleStartEdit,
    handleCancelEdit,
    handleBalanceTagColors,
  };
}
