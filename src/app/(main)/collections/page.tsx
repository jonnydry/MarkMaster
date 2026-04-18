"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { FolderOpen, Plus, Globe, Lock, Trash2, Layers, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { useSession } from "next-auth/react";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { sendJson } from "@/lib/fetch-json";
import {
  invalidateCollectionsQuery,
  invalidateLibraryQueries,
} from "@/lib/query-invalidation";
import { getStaggerClass } from "@/lib/stagger";
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

  const userCollections = collections.filter((c) => c.type !== "x_folder");
  const xFolders = collections.filter((c) => c.type === "x_folder");
  const collectionsSummary =
    !isLoading &&
    !isError &&
    collections.length > 0
      ? `${userCollections.length} personal ${
          userCollections.length === 1 ? "collection" : "collections"
        }${xFolders.length > 0 ? ` · ${xFolders.length} X ${xFolders.length === 1 ? "folder" : "folders"}` : ""}`
      : undefined;

  const handleCopyAsCollection = async (id: string) => {
    try {
      await sendJson(`/api/collections/${id}/copy`, { method: "POST" });
      await invalidateCollectionsQuery(queryClient);
      toast.success("Copied as a new collection");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not copy as collection"
      );
    }
  };

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const handleCollectionCardKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    collectionId: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(`/collections/${collectionId}`);
    }
  };

  return (
    <div className="app-shell-bg flex h-screen overflow-hidden">
      <div className="hidden md:block h-full min-h-0 shrink-0 overflow-hidden">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
          lastSyncAt={
            session?.dbUser?.lastSyncAt
              ? new Date(session.dbUser.lastSyncAt)
              : null
          }
          onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader
          title="Collections"
          description={collectionsSummary}
          leading={
            <div className="md:hidden">
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={[]}
                onTagToggle={goToTagOnDashboard}
                onCreateCollection={() => setCreateOpen(true)}
                onSyncComplete={() => void invalidateLibraryQueries(queryClient)}
              />
            </div>
          }
          actions={
            <>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                New
              </Button>
              {session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : null}
            </>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 bg-muted rounded-lg animate-pulse" />
              ))}
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
            <div className="flex h-72 flex-col items-center justify-center text-center">
              <div className="rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 shadow-sm sm:px-8">
              <Layers className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-lg font-medium">No collections yet</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Create a collection to start curating your bookmarks
              </p>
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create your first collection
              </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {userCollections.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    My Collections
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {userCollections.map((col, i) => (
                      <Card
                        key={col.id}
                        className={`group cursor-pointer border-hairline-soft bg-surface-1 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${getStaggerClass(i, "animate-fade-in-up") ?? ""}`}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/collections/${col.id}`)}
                        onKeyDown={(event) => handleCollectionCardKeyDown(event, col.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-primary" />
                            <span className="font-semibold">{col.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {col.isPublic ? (
                              <Globe className="w-4 h-4 text-success" />
                            ) : (
                              <Lock className="w-4 h-4 text-muted-foreground" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive"
                              aria-label={`Delete collection ${col.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Delete this collection? This cannot be undone.")) {
                                  void (async () => {
                                    try {
                                      await sendJson(`/api/collections/${col.id}`, { method: "DELETE" });
                                      await invalidateCollectionsQuery(queryClient);
                                      toast.success("Collection deleted");
                                    } catch (error) {
                                      toast.error(error instanceof Error ? error.message : "Could not delete collection");
                                    }
                                  })();
                                }
                              }}
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
                          <span>{new Date(col.createdAt).toLocaleDateString()}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {xFolders.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    X Folders
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {xFolders.map((col, i) => (
                      <Card
                        key={col.id}
                        className={`group cursor-pointer border-hairline-soft bg-surface-1 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${getStaggerClass(i, "animate-fade-in-up") ?? ""}`}
                        role="link"
                        tabIndex={0}
                        onClick={() => router.push(`/collections/${col.id}`)}
                        onKeyDown={(event) => handleCollectionCardKeyDown(event, col.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-muted-foreground" />
                            <span className="font-semibold">{col.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); void handleCopyAsCollection(col.id); }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </Button>
                        </div>
                        <Badge variant="outline" className="text-primary border-primary/30 mb-2">
                          Synced from X
                        </Badge>
                        {col.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                            {col.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {col._count.items} bookmark{col._count.items !== 1 ? "s" : ""}
                          </span>
                          <span>{new Date(col.createdAt).toLocaleDateString()}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={createCollection}
      />
    </div>
  );
}
