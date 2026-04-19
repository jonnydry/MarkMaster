"use client";

import { use, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Globe,
  Lock,
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
import { appChromeFrostedClassName } from "@/lib/app-chrome";
import { cn } from "@/lib/utils";
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
    error,
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

  const sortedItems = useMemo(
    () =>
      collection ? [...collection.items].sort((a, b) => a.sortOrder - b.sortOrder) : [],
    [collection]
  );
  const aboveFoldMediaBookmarkId = useMemo(() => {
    const row = sortedItems.find((item) => {
      const m = item.bookmark.media?.[0];
      return Boolean(m?.url || m?.preview_image_url);
    });
    return row?.bookmark.id ?? null;
  }, [sortedItems]);
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

    const prevItems = sortedItems;
    setReordering(true);
    try {
      const next = [...sortedItems];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      const payload = next.map((it, i) => ({
        bookmarkId: it.bookmark.id,
        sortOrder: i,
      }));

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
      <div className="app-shell-bg flex h-screen items-center justify-center">
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
    const isNotFound = error instanceof Error && error.message === "NOT_FOUND";
    return (
      <div className="app-shell-bg min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-muted-foreground text-center">
          {isNotFound
            ? "This collection does not exist or has been deleted."
            : "This collection could not be loaded. It may have been deleted or you may not have access."}
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
    <div className="app-shell-bg min-h-screen">
      <header
        className={cn(
          "sticky top-0 z-10 border-b border-hairline-strong",
          appChromeFrostedClassName
        )}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:px-5 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              className="size-10 shrink-0 border-hairline-soft bg-surface-1 shadow-sm"
              onClick={() => router.push("/collections")}
            >
              <ArrowLeft className="size-4" />
            </Button>

            <div className="min-w-0 flex-1">
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
                  className="w-full border-b border-primary bg-transparent pb-1 text-2xl font-bold tracking-tight heading-font outline-none sm:text-3xl"
                />
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">
                  {isSyncedFromX ? (
                    <FolderOpen className="w-6 h-6 text-muted-foreground shrink-0" aria-hidden />
                  ) : (
                    <Layers className="w-6 h-6 text-primary shrink-0" aria-hidden />
                  )}
                  {isSyncedFromX ? (
                    <h1 className="truncate text-2xl font-bold tracking-tight heading-font sm:text-3xl">
                      {collection.name}
                    </h1>
                  ) : (
                    <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight heading-font sm:text-3xl">
                      <button
                        type="button"
                        className="max-w-full truncate rounded-md text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        onClick={() => {
                          setName(collection.name ?? "");
                          setEditingName(true);
                        }}
                        aria-label={`Edit collection name ${collection.name}`}
                      >
                        {collection.name}
                      </button>
                    </h1>
                  )}
                </div>
              )}

              <p className="mt-1 text-sm text-muted-foreground">
                {sortedItems.length} bookmark{sortedItems.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {isSyncedFromX && (
              <>
                <Badge variant="outline" className="gap-1.5 border-primary/25 bg-accent-soft text-primary">
                  Synced from X
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 border-hairline-soft bg-surface-1 px-3 text-sm shadow-sm"
                  onClick={handleCopyAsCollection}
                >
                  <Copy className="size-4" />
                  Copy as Collection
                </Button>
              </>
            )}
            {isUserCollection && (
              <Badge variant="outline" className="gap-1.5 border-hairline-soft bg-surface-2/80">
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 border-hairline-soft bg-surface-1 px-3 text-sm shadow-sm"
                  onClick={handleTogglePublic}
                >
                  {collection.isPublic ? "Make Private" : "Make Public"}
                </Button>
                {collection.isPublic && collection.shareSlug && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 gap-1.5 border-hairline-soft bg-surface-1 px-3 text-sm shadow-sm"
                      onClick={handleCopyShareLink}
                    >
                      <Copy className="size-4" />
                      Copy Link
                    </Button>
                    <a
                      href={`/share/${collection.shareSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex size-10 items-center justify-center rounded-xl border border-hairline-soft bg-surface-1 shadow-sm transition-colors hover:bg-surface-2"
                      aria-label="Open public collection page"
                      title="Open public collection page"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </>
                )}
                {sortedItems.length > 0 && collection.isPublic && collection.shareSlug && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-10 gap-1.5 px-3 text-sm shadow-sm"
                    onClick={handleShareOnX}
                  >
                    <Share2 className="size-4" />
                    Share on X
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-5">
        {collection.description && (
          <div className="border-b border-hairline-soft py-4">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {collection.description}
            </p>
          </div>
        )}

        {sortedItems.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto max-w-md rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 shadow-sm">
            {isSyncedFromX ? (
              <FolderOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
            ) : (
              <Layers className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
            )}
            <p className="text-muted-foreground">
              No bookmarks in this collection yet.
              <br />
              Add bookmarks from the dashboard.
            </p>
            {!isSyncedFromX && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
                  Go to dashboard
                </Button>
              </div>
            )}
            </div>
          </div>
        ) : (
          <div>
            {sortedItems.map((item, index) => (
              <div key={item.id} className="group flex gap-2 sm:gap-3">
                {!isSyncedFromX && (
                  <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-0.5 sm:px-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-6 w-6 border border-transparent text-muted-foreground hover:border-hairline-soft hover:bg-surface-2 hover:text-foreground sm:h-7 sm:w-7"
                      disabled={reordering || index === 0}
                      onClick={() => moveItem(index, -1)}
                      aria-label="Move bookmark up"
                    >
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-6 w-6 border border-transparent text-muted-foreground hover:border-hairline-soft hover:bg-surface-2 hover:text-foreground sm:h-7 sm:w-7"
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
                    priorityMedia={item.bookmark.id === aboveFoldMediaBookmarkId}
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
