"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { FolderOpen, Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { UserCollectionCard, XFolderCard } from "./collection-card";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

export default function CollectionsPage() {
  const router = useRouter();
  const { data: session } = useSession();
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

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const handleNavigate = useCallback(
    (collectionId: string) => router.push(`/collections/${collectionId}`),
    [router]
  );

  const handleCopy = useCallback(
    async (id: string) => {
      try {
        await sendJson(`/api/collections/${id}/copy`, { method: "POST" });
        await invalidateCollectionsQuery(queryClient);
        toast.success("Copied as a new collection");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not copy as collection"
        );
      }
    },
    [queryClient]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this collection? This cannot be undone."))
        return;
      try {
        await sendJson(`/api/collections/${id}`, { method: "DELETE" });
        await invalidateCollectionsQuery(queryClient);
        toast.success("Collection deleted");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not delete collection"
        );
      }
    },
    [queryClient]
  );

  return (
    <div className="app-shell-bg flex h-screen overflow-x-hidden">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <PageHeader
            sticky
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
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="h-10 gap-2 px-3 text-sm"
                >
                  <Plus className="size-4" />
                  New
                </Button>
                {session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : null}
              </>
            }
          />

          <div className="p-4 sm:p-5">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl border border-hairline-soft bg-surface-1 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl skeleton-shimmer" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 rounded skeleton-shimmer" />
                      <div className="h-3 w-16 rounded skeleton-shimmer" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-3 w-full rounded skeleton-shimmer" />
                    <div className="h-3 w-4/5 rounded skeleton-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="rounded-2xl border border-hairline-soft bg-surface-1 p-6">
                <p className="text-sm font-medium text-foreground">Collections could not be loaded</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {error instanceof Error ? error.message : "Please try again."}
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
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
                      <UserCollectionCard
                        key={col.id}
                        collection={col}
                        index={i}
                        onNavigate={handleNavigate}
                        onDelete={handleDelete}
                      />
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
                      <XFolderCard
                        key={col.id}
                        collection={col}
                        index={i}
                        onNavigate={handleNavigate}
                        onCopy={handleCopy}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          </div>
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
