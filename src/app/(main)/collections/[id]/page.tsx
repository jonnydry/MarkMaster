"use client";

import { use, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Globe,
  Lock,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  ExternalLink,
  Layers,
  FolderOpen,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookmarkCard } from "@/components/bookmark-card";
import { toast } from "sonner";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import { invalidateCollectionQueries } from "@/lib/query-invalidation";
import type { BookmarkWithRelations } from "@/types";
import type { ShareContent } from "@/lib/share-content";

const ShareDialog = dynamic(
  () => import("@/components/share-dialog").then((m) => m.ShareDialog),
  { ssr: false }
);

type CollectionItemRow = {
  id: string;
  sortOrder: number;
  bookmark: BookmarkWithRelations;
};

type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  type: string;
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContent | null>(null);

  const {
    data: collection,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["collection", id],
    queryFn: async () => {
      try {
        return await fetchJson<CollectionDetail>(`/api/collections/${id}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
          throw new Error("NOT_FOUND");
        }
        throw new Error("LOAD_FAILED");
      }
    },
  });

  const sortedItems = collection
    ? [...collection.items].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const isSyncedFromX = collection?.type === "x_folder";
  const isUserCollection = collection?.type === "user_collection";

  const cancelEditingName = () => {
    if (!collection) return;
    setName(collection.name);
    setEditingName(false);
  };

  const handleCopyAsCollection = async () => {
    if (!collection) return;
    try {
      await sendJson(`/api/collections/${id}/copy`, { method: "POST" });
      toast.success("Copied as a new collection");
      router.push("/collections");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not copy as collection"
      );
    }
  };

  const handleTogglePublic = async () => {
    if (!collection) return;
    try {
      const updated = await sendJson<{ isPublic?: boolean }>(`/api/collections/${id}`, {
        method: "PATCH",
        body: { isPublic: !collection.isPublic },
      });
      await invalidateCollectionQueries(queryClient, id);
      if (updated.isPublic) {
        toast.success("Collection is now public");
      } else {
        toast.success("Collection is now private");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update visibility"
      );
    }
  };

  const handleCopyShareLink = async () => {
    if (!collection?.shareSlug) return;
    try {
      const url = `${window.location.origin}/share/${collection.shareSlug}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied!");
    } catch {
      toast.error("Could not copy link to clipboard");
    }
  };

  const handleRemoveItem = async (bookmarkId: string) => {
    try {
      await sendJson(`/api/collections/${id}/items`, {
        method: "DELETE",
        body: { bookmarkId },
      });
      await invalidateCollectionQueries(queryClient, id);
      toast.success("Removed from collection");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove bookmark"
      );
    }
  };

  const handleShareOnX = async () => {
    if (!collection) return;
    try {
      const content = await fetchJson<ShareContent>(
        `/api/collections/${id}/publish`,
        { method: "POST" }
      );
      setShareContent(content);
      setShareOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not generate share content"
      );
    }
  };

  const handleUpdateName = async () => {
    if (!collection) return;

    if (!name.trim()) {
      cancelEditingName();
      return;
    }

    try {
      await sendJson(`/api/collections/${id}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
      await invalidateCollectionQueries(queryClient, id);
      setEditingName(false);
      toast.success("Name updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update name"
      );
    }
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
      await sendJson(`/api/collections/${id}/items`, {
        method: "PATCH",
        body: { items: payload },
      });
      await invalidateCollectionQueries(queryClient, id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reorder items"
      );
    } finally {
      setReordering(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="max-w-4xl mx-auto w-full px-6 space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
        </div>
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
          <Button variant="outline" onClick={() => router.push("/collections")}>
            Back to collections
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-4xl mx-auto px-5 h-12 flex items-center gap-3">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleUpdateName();
                  }

                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditingName();
                  }
                }}
                className="text-lg font-semibold bg-transparent border-b border-primary outline-none w-full"
              />
            ) : (
              <div className="flex items-center gap-2">
                {isSyncedFromX ? (
                  <FolderOpen className="w-5 h-5 text-muted-foreground shrink-0" />
                ) : (
                  <Layers className="w-5 h-5 text-primary shrink-0" />
                )}
                {isSyncedFromX ? (
                  <h1 className="text-xl font-bold truncate">{collection.name}</h1>
                ) : (
                  <button
                    type="button"
                    className="truncate text-left text-xl font-bold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    onClick={() => {
                      setName(collection.name);
                      setEditingName(true);
                    }}
                    aria-label={`Edit collection name ${collection.name}`}
                  >
                    {collection.name}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {isSyncedFromX && (
              <>
                <Badge variant="outline" className="text-primary border-primary/30">
                  Synced from X
                </Badge>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyAsCollection}>
                  <Copy className="w-3.5 h-3.5" />
                  Copy as Collection
                </Button>
              </>
            )}
            {isUserCollection && (
              <Badge variant="outline" className="gap-1.5">
                {collection.isPublic ? (
                  <Globe className="w-3 h-3 text-success" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {collection.isPublic ? "Public" : "Private"}
              </Badge>
            )}
            {isUserCollection && (
              <>
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
                       aria-label="Open public collection page"
                       title="Open public collection page"
                     >
                       <ExternalLink className="w-3.5 h-3.5" />
                     </a>
                  </>
                )}
                {sortedItems.length > 0 &&
                  collection.isPublic &&
                  collection.shareSlug && (
                  <Button variant="default" size="sm" className="gap-1.5" onClick={handleShareOnX}>
                    <Share2 className="w-3.5 h-3.5" />
                    Share on X
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
{collection.description && (
          <p className="px-5 py-2 text-muted-foreground">
            {collection.description}
          </p>
        )}

        <div className="text-sm text-muted-foreground px-5 py-1.5">
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
                  <div className="flex flex-col items-center justify-center px-1 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity border-r border-transparent sm:border-transparent">
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
                  <div className="flex items-start pt-4 pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        shareContent={shareContent}
      />
    </div>
  );
}
