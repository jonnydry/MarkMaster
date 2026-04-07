"use client";

import { use, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  Lock,
  Trash2,
  GripVertical,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookmarkCard } from "@/components/bookmark-card";
import { toast } from "sonner";

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

  const { data: collection } = useQuery({
    queryKey: ["collection", id],
    queryFn: async () => {
      const res = await fetch(`/api/collections/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const handleTogglePublic = async () => {
    if (!collection) return;
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !collection.isPublic }),
    });
    const updated = await res.json();
    queryClient.invalidateQueries({ queryKey: ["collection", id] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    if (updated.shareSlug) {
      toast.success("Collection is now public!");
    }
  };

  const handleCopyShareLink = () => {
    if (!collection?.shareSlug) return;
    const url = `${window.location.origin}/share/${collection.shareSlug}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied!");
  };

  const handleRemoveItem = async (bookmarkId: string) => {
    await fetch(`/api/collections/${id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkId }),
    });
    queryClient.invalidateQueries({ queryKey: ["collection", id] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    toast.success("Removed from collection");
  };

  const handleUpdateName = async () => {
    if (!name.trim()) return;
    await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    queryClient.invalidateQueries({ queryKey: ["collection", id] });
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    setEditingName(false);
  };

  if (!collection) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                onKeyDown={(e) => e.key === "Enter" && handleUpdateName()}
                className="text-lg font-semibold bg-transparent border-b border-primary outline-none w-full"
              />
            ) : (
              <h1
                className="text-lg font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setName(collection.name);
                  setEditingName(true);
                }}
              >
                {collection.name}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              {collection.isPublic ? (
                <Globe className="w-3 h-3 text-green-500" />
              ) : (
                <Lock className="w-3 h-3" />
              )}
              {collection.isPublic ? "Public" : "Private"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePublic}
            >
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
          {collection.items.length} bookmark
          {collection.items.length !== 1 ? "s" : ""}
        </div>

        {collection.items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              No bookmarks in this collection yet.
              <br />
              Add bookmarks from the dashboard.
            </p>
          </div>
        ) : (
          <div>
            {collection.items.map(
              (item: {
                id: string;
                sortOrder: number;
                bookmark: BookmarkWithRelationsFromApi;
              }) => (
                <div key={item.id} className="flex group">
                  <div className="flex items-center px-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <BookmarkCard
                      bookmark={item.bookmark as never}
                      viewMode="feed"
                      onDelete={() =>
                        handleRemoveItem(item.bookmark.id)
                      }
                    />
                  </div>
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
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}

type BookmarkWithRelationsFromApi = {
  id: string;
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorProfileImage: string | null;
  authorVerified: boolean;
  tweetText: string;
  publicMetrics: Record<string, number> | null;
  media: unknown[] | null;
  urls: unknown[] | null;
  quotedTweet: unknown | null;
  tweetCreatedAt: string;
  bookmarkedAt: string;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  notes: Array<{ id: string; content: string }>;
};
