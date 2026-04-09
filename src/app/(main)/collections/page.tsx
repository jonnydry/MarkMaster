"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FolderOpen, Plus, Globe, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { Sidebar } from "@/components/sidebar";
import { RightPanel } from "@/components/right-panel";
import { UserNav } from "@/components/user-nav";
import { useSession } from "next-auth/react";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { sendJson } from "@/lib/fetch-json";
import { invalidateCollectionsQuery } from "@/lib/query-invalidation";
import { toast } from "sonner";
import type { DbUser } from "@/lib/auth";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

export default function CollectionsPage() {
  const router = useRouter();
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const queryClient = useQueryClient();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: collections = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCollectionsQuery();

  const { data: tags = [] } = useTagsQuery();

  const handleDelete = async (id: string) => {
    try {
      await sendJson(`/api/collections/${id}`, { method: "DELETE" });
      await invalidateCollectionsQuery(queryClient);
      toast.success("Collection deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete collection"
      );
    }
  };

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={[]}
                onTagToggle={goToTagOnDashboard}
                onCreateCollection={() => setCreateOpen(true)}
              />
              <h1 className="text-xl font-bold tracking-tight">Collections</h1>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                New
              </Button>
              {session?.dbUser && <UserNav user={session.dbUser} />}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
              <p className="text-lg font-medium">Collections could not be loaded</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </p>
              <Button size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : collections.length === 0 ? (
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
                       {col.externalSource !== "x-bookmark-folder" && (
                         <Button
                           variant="ghost"
                           size="icon"
                           className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                           onClick={() => handleDelete(col.id)}
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </Button>
                       )}
                     </div>
                   </div>
                   {col.externalSource === "x-bookmark-folder" && (
                     <p className="text-xs text-primary mb-2">Synced from X folder</p>
                   )}
                   {col.description && (
                     <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                       {col.description}
                     </p>
                   )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {col._count.items} bookmark
                      {col._count.items !== 1 ? "s" : ""}
                    </span>
                    <span>{new Date(col.createdAt).toLocaleDateString()}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden xl:block">
        <RightPanel
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
        />
      </div>

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={createCollection}
      />
    </div>
  );
}
