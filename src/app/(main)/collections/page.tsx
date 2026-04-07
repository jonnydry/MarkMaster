"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderOpen, Plus, Globe, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateCollectionDialog } from "@/components/create-collection-dialog";
import { Sidebar } from "@/components/sidebar";
import { UserNav } from "@/components/user-nav";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import type { CollectionWithCount, TagWithCount } from "@/types";
import type { DbUser } from "@/lib/auth";

export default function CollectionsPage() {
  const router = useRouter();
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: collections = [] } = useQuery<CollectionWithCount[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await fetch("/api/collections");
      return res.json();
    },
  });

  const { data: tags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      return res.json();
    },
  });

  const handleCreate = async (
    name: string,
    description: string,
    isPublic: boolean
  ) => {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, isPublic }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data as { error?: string }).error || "Could not create collection";
      toast.error(message);
      throw new Error(message);
    }
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    toast.success("Collection created");
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(
        (data as { error?: string }).error || "Could not delete collection"
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["collections"] });
    toast.success("Collection deleted");
  };

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tags={tags}
        collections={collections}
        selectedTags={[]}
        onTagToggle={goToTagOnDashboard}
        onCreateCollection={() => setCreateOpen(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border flex items-center justify-between px-8 py-5 shrink-0">
          <h1 className="text-2xl font-extrabold tracking-[-0.04em]">Collections</h1>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              New Collection
            </Button>
            {session?.dbUser && <UserNav user={session.dbUser} />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium mb-2">No collections yet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create a collection to start curating your bookmarks
              </p>
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create your first collection
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map((col) => (
                <Card
                  key={col.id}
                  className="p-5 hover:border-primary/30 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-primary" />
                      <Link
                        href={`/collections/${col.id}`}
                        className="font-semibold hover:text-primary transition-colors"
                      >
                        {col.name}
                      </Link>
                    </div>
                    <div className="flex items-center gap-1">
                      {col.isPublic ? (
                        <Globe className="w-4 h-4 text-green-500" />
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={() => handleDelete(col.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {col.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {col.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {col._count.items} bookmark{col._count.items !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {new Date(col.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={handleCreate}
      />
    </div>
  );
}
