"use client";

import dynamic from "next/dynamic";
import { FolderOpen, Layers, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import {
  COLLECTION_SHORTCUT_GROUPS,
  useCollectionsPage,
} from "@/hooks/use-collections-page";
import { UserCollectionCard, XFolderCard } from "./collection-card";
import { CollectionsControlBar } from "./collections-control-bar";
import { CollectionsOverview } from "./collections-overview";
import { NoCollectionMatches } from "./collections-no-matches";
import { CollectionsSection } from "./collections-section";
import { LazyCollectionsDiscoverySlot } from "./lazy-collections-discovery-slot";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

export default function CollectionsPage() {
  const page = useCollectionsPage();
  const {
    session,
    createCollection,
    createOpen,
    setCreateOpen,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    activeCollectionId,
    searchInputRef,
    collections,
    tags,
    isLoading,
    isError,
    error,
    refetch,
    userCollections,
    xFolders,
    collectionStats,
    libraryStats,
    isLibraryStatsLoading,
    filteredCollections,
    visibleUserCollections,
    visibleXFolders,
    hasActiveFilters,
    collectionsSummary,
    lastSyncAt,
    goToTagOnDashboard,
    handleNavigate,
    handleCopy,
    handleDelete,
    clearCollectionFilters,
    handleSyncComplete,
    handleCreateCollectionOpen,
  } = page;

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden md:block h-full min-h-0 shrink-0 overflow-hidden">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={lastSyncAt}
          totalBookmarks={libraryStats?.libraryBookmarkCount}
          onSyncComplete={handleSyncComplete}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="app-main-scroll scrollbar-thin">
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
                  onCreateCollection={handleCreateCollectionOpen}
                  totalBookmarks={libraryStats?.libraryBookmarkCount}
                  onSyncComplete={handleSyncComplete}
                />
              </div>
            }
            actions={
              <>
                <KeyboardShortcutsHelpButton
                  open={keyboardShortcutsOpen}
                  onOpenChange={setKeyboardShortcutsOpen}
                  groups={COLLECTION_SHORTCUT_GROUPS}
                  description="Collection browsing, filtering, and creation shortcuts."
                />
                <Button
                  size="sm"
                  onClick={handleCreateCollectionOpen}
                  className="h-9 gap-2 px-3 text-sm"
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
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-8">
                <div className="h-10 w-64 rounded skeleton-shimmer" />
                <div className="grid gap-3 xl:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-32 rounded-sm border border-hairline-soft bg-surface-1 p-4 skeleton-shimmer"
                    />
                  ))}
                </div>
              </div>
            ) : isError ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <ErrorState
                  layout="panel"
                  title="Collections could not be loaded"
                  description={
                    error instanceof Error ? error.message : "Please try again."
                  }
                  action={<RetryButton onClick={() => refetch()} />}
                />
              </div>
            ) : collections.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No collections yet"
                description="Create a collection to start curating your bookmarks."
                action={
                  <Button onClick={handleCreateCollectionOpen} className="mt-5 gap-2">
                    <Plus className="h-4 w-4" />
                    Create collection
                  </Button>
                }
              />
            ) : (
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
                <CollectionsOverview
                  libraryBookmarkCount={libraryStats?.libraryBookmarkCount}
                  organizedBookmarkCount={
                    libraryStats?.organizedBookmarkCount ?? 0
                  }
                  isLibraryStatsLoading={isLibraryStatsLoading}
                  totalCollections={collections.length}
                  userCollections={userCollections.length}
                  xFolders={xFolders.length}
                  publicCollections={collectionStats.publicCount}
                  emptyCollections={collectionStats.emptyCount}
                  largestCollection={collectionStats.largestCollection}
                  maxItems={collectionStats.maxItems}
                  onCreateCollection={handleCreateCollectionOpen}
                  onOpenCollection={handleNavigate}
                />

                <LazyCollectionsDiscoverySlot tags={tags} />

                <CollectionsControlBar
                  searchQuery={searchQuery}
                  activeFilter={activeFilter}
                  totalCount={collections.length}
                  userCount={userCollections.length}
                  publicCount={collectionStats.publicCount}
                  xFolderCount={xFolders.length}
                  filteredCount={filteredCollections.length}
                  hasActiveFilters={hasActiveFilters}
                  searchInputRef={searchInputRef}
                  onSearchChange={setSearchQuery}
                  onFilterChange={setActiveFilter}
                  onClear={clearCollectionFilters}
                />

                {filteredCollections.length === 0 ? (
                  <NoCollectionMatches onClear={clearCollectionFilters} />
                ) : (
                  <div className="space-y-6">
                    {visibleUserCollections.length > 0 && (
                      <CollectionsSection
                        icon={Layers}
                        title="My Collections"
                        count={visibleUserCollections.length}
                      >
                        {visibleUserCollections.map((col) => (
                          <UserCollectionCard
                            key={col.id}
                            collection={col}
                            maxItems={collectionStats.maxItems}
                            onNavigate={handleNavigate}
                            onDelete={handleDelete}
                            selected={activeCollectionId === col.id}
                          />
                        ))}
                      </CollectionsSection>
                    )}

                    {visibleXFolders.length > 0 && (
                      <CollectionsSection
                        icon={FolderOpen}
                        title="X Folders"
                        count={visibleXFolders.length}
                      >
                        {visibleXFolders.map((col) => (
                          <XFolderCard
                            key={col.id}
                            collection={col}
                            maxItems={collectionStats.maxItems}
                            onNavigate={handleNavigate}
                            onCopy={handleCopy}
                            selected={activeCollectionId === col.id}
                          />
                        ))}
                      </CollectionsSection>
                    )}
                  </div>
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
