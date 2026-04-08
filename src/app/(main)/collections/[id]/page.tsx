"use client";

import { use, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  Lock,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookmarkCard } from "@/components/bookmark-card";
import { toast } from "sonner";
import type { BookmarkWithRelations } from "@/types";

type CollectionItemRow = {
  id: string;
  sortOrder: number;
  bookmark: BookmarkWithRelations;
};

type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  shareSlug: string | null;
  externalSource: string | null;
  externalSourceId: string | null;
  items: CollectionItemRow[];
};

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [reordering, setReordering] = useState(false);

  const {
    data: collection,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["collection", id],
    queryFn: async () => {
      const res = await fetch(`/api/collections/${id}`);
      if (res.status === 404) {
        throw new Error("NOT_FOUND");
      }
      if (!res.ok) {
        throw new Error("LOAD_FAILED");
      }
      return res.json() as Promise<CollectionDetail>;
    },
  });

  const sortedItems = collection
    ? [...collection.items].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const isSyncedFromX = collection?.externalSource === "x-bookmark-folder";

  const handleTogglePublic = async () => {
    if (!collection) return;
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !collection.isPublic }),
    });
    const updated = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        (updated as { error?: string }).error || "Could not update visibility"
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["collection", id] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    if ((updated as { isPublic?: boolean }).isPublic) {
      toast.success("Collection is now public");
    } else {
      toast.success("Collection is now private");
    }
  };

  const handleCopyShareLink = () => {
    if (!collection?.shareSlug) return;
    const url = `${window.location.origin}/share/${collection.shareSlug}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied!");
  };

  const handleRemoveItem = async (bookmarkId: string) => {
    const res = await fetch(`/api/collections/${id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        (data as { error?: string }).error || "Could not remove bookmark"
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["collection", id] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    toast.success("Removed from collection");
  };

  const handleUpdateName = async () => {
    if (!name.trim()) return;
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        (data as { error?: string }).error || "Could not update name"
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["collection", id] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    setEditingName(false);
    toast.success("Name updated");
  };

  const moveItem = async (fromIndex: number, direction: -1 | 1) => {
    if (!collection || reordering) return;
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= sortedItems.length) return;

    const next = [...sortedItems];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    const payload = next.map((it, i) => ({
      bookmarkId: it.bookmark.id,
      sortOrder: i,
    }));

    setReordering(true);
    try {
      const res = await fetch(`/api/collections/${id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          (data as { error?: string }).error || "Could not reorder items"
        );
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
    } finally {
      setReordering(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !collection) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-muted-foreground text-center">
          This collection could not be loaded. It may have been deleted or you
          may not have access.
        </p>
        <Button variant="outline" onClick={() => router.push("/collections")}>
          Back to collections
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/collections")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleUpdateName}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleUpdateName(); } }}
                className="text-lg font-semibold bg-transparent border-b border-primary outline-none w-full"
              />
            ) : (
              <h1
                className={`text-lg font-semibold truncate transition-colors ${
                  isSyncedFromX
                    ? "cursor-default"
                    : "cursor-pointer hover:text-primary"
                }`}
                onClick={() => {
                  if (isSyncedFromX) return;
                  setName(collection.name);
                  setEditingName(true);
                }}
              >
                {collection.name}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {isSyncedFromX && (
              <Badge variant="outline" className="text-primary border-primary/30">
                Synced from X
              </Badge>
            )}
            <Badge variant="outline" className="gap-1.5">
              {collection.isPublic ? (
                <Globe className="w-3 h-3 text-green-500" />
              ) : (
                <Lock className="w-3 h-3" />
              )}
              {collection.isPublic ? "Public" : "Private"}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleTogglePublic}>
              {collection.isPublic ? "Make Private" : "Make Public"}
            </Button>
            {collection.isPublic && collection.shareSlug && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleCopyShareLink}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Link
                </Button>
                <a
                  href={`/share/${collection.shareSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center size-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        {collection.description && (
          <p className="px-6 py-4 text-muted-foreground border-b border-border">
            {collection.description}
          </p>
        )}

        <div className="text-sm text-muted-foreground px-6 py-3 border-b border-border">
          {sortedItems.length} bookmark
          {sortedItems.length !== 1 ? "s" : ""}
        </div>

        {sortedItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              No bookmarks in this collection yet.
              <br />
              Add bookmarks from the dashboard.
            </p>
          </div>
        ) : (
          <div>
            {sortedItems.map((item, index) => (
              <div key={item.id} className="flex group">
                {!isSyncedFromX && (
                  <div className="flex flex-col items-center justify-center px-1 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity border-r border-transparent">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      disabled={reordering || index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label="Move bookmark up"
                    >
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      disabled={reordering || index === sortedItems.length - 1}
                      onClick={() => moveItem(index, 1)}
                      aria-label="Move bookmark down"
                    >
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <BookmarkCard
                    bookmark={item.bookmark}
                    viewMode="feed"
                    onDelete={
                      isSyncedFromX
                        ? undefined
                        : () => handleRemoveItem(item.bookmark.id)
                    }
                    deleteLabel={
                      isSyncedFromX ? undefined : "Remove from collection"
                    }
                  />
                </div>
                {!isSyncedFromX && (
                  <div className="flex items-start pt-4 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemoveItem(item.bookmark.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
