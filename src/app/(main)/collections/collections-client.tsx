"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  ArrowRight,
  Archive,
  BarChart3,
  FolderOpen,
  Layers,
  LibraryBig,
  Plus,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { useSession } from "next-auth/react";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import {
  scrollDataElementIntoView,
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { sendJson } from "@/lib/fetch-json";
import {
  invalidateCollectionsQuery,
  invalidateLibraryQueries,
} from "@/lib/query-invalidation";
import { toast } from "sonner";
import { UserCollectionCard, XFolderCard } from "./collection-card";
import type { CollectionWithCount, TagWithCount } from "@/types";
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

const CollectionsDiscoveryPanel = dynamic(
  () =>
    import("./collections-discovery-panel").then(
      (m) => m.CollectionsDiscoveryPanel
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 rounded-sm border border-hairline-soft bg-surface-1/45" />
    ),
  }
);

type CollectionFilter = "all" | "mine" | "public" | "x_folders";

const COLLECTION_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { id: "next", keys: ["J"], label: "Next collection" },
      { id: "previous", keys: ["K"], label: "Previous collection" },
      { id: "open", keys: ["O"], label: "Open selected collection" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Collections",
    shortcuts: [
      { id: "search", keys: ["/"], label: "Search collections" },
      { id: "new", keys: ["N"], label: "New collection" },
      { id: "filter-all", keys: ["1"], label: "Filter: All" },
      { id: "filter-mine", keys: ["2"], label: "Filter: Mine" },
      { id: "filter-public", keys: ["3"], label: "Filter: Public" },
      { id: "filter-x", keys: ["4"], label: "Filter: X folders" },
    ],
  },
];

function getCollectionItemCount(collection: CollectionWithCount) {
  return collection._count?.items ?? 0;
}

function bookmarkLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "bookmark" : "bookmarks"}`;
}

function collectionLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "collection" : "collections"}`;
}

function splitCollections(collections: CollectionWithCount[]) {
  const grouped = {
    userCollections: [] as CollectionWithCount[],
    xFolders: [] as CollectionWithCount[],
  };

  for (const collection of collections) {
    if (collection.type === "x_folder") {
      grouped.xFolders.push(collection);
    } else {
      grouped.userCollections.push(collection);
    }
  }

  return grouped;
}

function collectionMatchesSearch(
  collection: CollectionWithCount,
  normalizedSearch: string
) {
  if (!normalizedSearch) return true;

  const status = collection.type === "x_folder"
    ? "x folder synced folder"
    : collection.isPublic
      ? "public personal collection"
      : "private personal collection";

  return [collection.name, collection.description, status]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedSearch);
}

function LazyCollectionsDiscoverySlot({ tags }: { tags: TagWithCount[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const timeout = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref}>
      {visible ? (
        <CollectionsDiscoveryPanel tags={tags} />
      ) : (
        <div className="h-44 rounded-sm border border-hairline-soft bg-surface-1/45" />
      )}
    </div>
  );
}

export default function CollectionsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<CollectionFilter>("all");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: collections = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCollectionsQuery();

  const { data: tags = [] } = useTagsQuery();

  const { userCollections, xFolders } = useMemo(
    () => splitCollections(collections),
    [collections]
  );
  const collectionStats = useMemo(() => {
    let totalBookmarks = 0;
    let emptyCount = 0;
    let largestCollection: CollectionWithCount | null = null;

    for (const collection of collections) {
      const count = getCollectionItemCount(collection);
      totalBookmarks += count;
      if (count === 0) emptyCount += 1;
      if (
        !largestCollection ||
        count > getCollectionItemCount(largestCollection)
      ) {
        largestCollection = collection;
      }
    }

    return {
      totalBookmarks,
      emptyCount,
      publicCount: userCollections.filter((collection) => collection.isPublic)
        .length,
      maxItems: largestCollection
        ? getCollectionItemCount(largestCollection)
        : 0,
      largestCollection,
    };
  }, [collections, userCollections]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredCollections = useMemo(
    () =>
      collections.filter((collection) => {
        const matchesFilter =
          activeFilter === "all" ||
          (activeFilter === "mine" && collection.type === "user_collection") ||
          (activeFilter === "public" &&
            collection.type === "user_collection" &&
            collection.isPublic) ||
          (activeFilter === "x_folders" && collection.type === "x_folder");

        return (
          matchesFilter &&
          collectionMatchesSearch(collection, normalizedSearch)
        );
      }),
    [activeFilter, collections, normalizedSearch]
  );
  const {
    userCollections: visibleUserCollections,
    xFolders: visibleXFolders,
  } = useMemo(() => splitCollections(filteredCollections), [filteredCollections]);
  const visibleCollectionIds = useMemo(
    () => [
      ...visibleUserCollections.map((collection) => collection.id),
      ...visibleXFolders.map((collection) => collection.id),
    ],
    [visibleUserCollections, visibleXFolders]
  );
  const hasActiveFilters = activeFilter !== "all" || normalizedSearch.length > 0;
  const collectionsSummary =
    !isLoading &&
    !isError &&
    collections.length > 0
      ? `${userCollections.length} personal ${
          userCollections.length === 1 ? "collection" : "collections"
        }${xFolders.length > 0 ? ` · ${xFolders.length} X ${xFolders.length === 1 ? "folder" : "folders"}` : ""}`
      : undefined;

  const goToTagOnDashboard = useCallback((tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  }, [router]);

  const handleNavigate = useCallback(
    (collectionId: string) => router.push(`/collections/${collectionId}`),
    [router]
  );

  const selectCollectionByOffset = useCallback(
    (offset: -1 | 1) => {
      if (visibleCollectionIds.length === 0) return;
      const currentIndex = activeCollectionId
        ? visibleCollectionIds.indexOf(activeCollectionId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.max(0, Math.min(visibleCollectionIds.length - 1, currentIndex + offset));
      const nextId = visibleCollectionIds[nextIndex];
      if (!nextId) return;
      setActiveCollectionId(nextId);
      requestAnimationFrame(() =>
        scrollDataElementIntoView("data-collection-id", nextId)
      );
    },
    [activeCollectionId, visibleCollectionIds]
  );

  const handleCopy = useCallback(
    async (id: string) => {
      try {
        await copyCollectionAsUserCollection(id, queryClient);
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

  const clearCollectionFilters = useCallback(() => {
    setSearchQuery("");
    setActiveFilter("all");
  }, []);

  useSurfaceKeyboardShortcuts({
    shortcutGroups: COLLECTION_SHORTCUT_GROUPS,
    actions: {
      next: () => selectCollectionByOffset(1),
      previous: () => selectCollectionByOffset(-1),
      open: () => {
        const targetId =
          activeCollectionId && visibleCollectionIds.includes(activeCollectionId)
            ? activeCollectionId
            : visibleCollectionIds[0];
        if (targetId) handleNavigate(targetId);
      },
      shortcuts: () => setKeyboardShortcutsOpen(true),
      search: () => searchInputRef.current?.focus(),
      new: () => setCreateOpen(true),
      "filter-all": () => setActiveFilter("all"),
      "filter-mine": () => setActiveFilter("mine"),
      "filter-public": () => setActiveFilter("public"),
      "filter-x": () => setActiveFilter("x_folders"),
    },
  });

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
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
          onSyncComplete={() => void invalidateLibraryQueries(queryClient, { refetchType: "all" })}
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
                  onCreateCollection={() => setCreateOpen(true)}
                  onSyncComplete={() => void invalidateLibraryQueries(queryClient, { refetchType: "all" })}
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
                  onClick={() => setCreateOpen(true)}
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
                    <div key={i} className="h-32 rounded-sm border border-hairline-soft bg-surface-1 p-4 skeleton-shimmer" />
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
                  <Button onClick={() => setCreateOpen(true)} className="mt-5 gap-2">
                    <Plus className="h-4 w-4" />
                    Create collection
                  </Button>
                }
              />
            ) : (
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
                <CollectionsOverview
                  totalBookmarks={collectionStats.totalBookmarks}
                  totalCollections={collections.length}
                  userCollections={userCollections.length}
                  xFolders={xFolders.length}
                  publicCollections={collectionStats.publicCount}
                  emptyCollections={collectionStats.emptyCount}
                  largestCollection={collectionStats.largestCollection}
                  maxItems={collectionStats.maxItems}
                  onCreateCollection={() => setCreateOpen(true)}
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

function CollectionsOverview({
  totalBookmarks,
  totalCollections,
  userCollections,
  xFolders,
  publicCollections,
  emptyCollections,
  largestCollection,
  maxItems,
  onCreateCollection,
  onOpenCollection,
}: {
  totalBookmarks: number;
  totalCollections: number;
  userCollections: number;
  xFolders: number;
  publicCollections: number;
  emptyCollections: number;
  largestCollection: CollectionWithCount | null;
  maxItems: number;
  onCreateCollection: () => void;
  onOpenCollection: (id: string) => void;
}) {
  const largestCount = largestCollection
    ? getCollectionItemCount(largestCollection)
    : 0;
  const largestWidth = maxItems > 0
    ? Math.max(8, Math.round((largestCount / maxItems) * 100))
    : 0;

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
      <div className="relative overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/80 p-4 shadow-sm sm:p-5">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-primary/15 bg-primary/10 text-primary">
              <LibraryBig className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="heading-font text-2xl font-bold tracking-tight sm:text-3xl">
                {bookmarkLabel(totalBookmarks)}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Organized across {collectionLabel(totalCollections)}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-9 w-full gap-1.5 sm:w-auto"
            onClick={onCreateCollection}
          >
            <Plus className="h-4 w-4" />
            New collection
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <CollectionMetric
            icon={Layers}
            label="Personal"
            value={userCollections.toLocaleString()}
            tone="primary"
          />
          <CollectionMetric
            icon={FolderOpen}
            label="X folders"
            value={xFolders.toLocaleString()}
            tone="note"
          />
          <CollectionMetric
            icon={Sparkles}
            label="Public"
            value={publicCollections.toLocaleString()}
            tone="success"
          />
          <CollectionMetric
            icon={Archive}
            label="Empty"
            value={emptyCollections.toLocaleString()}
            tone="muted"
          />
        </div>
      </div>

      <div className="rounded-sm border border-hairline-soft bg-surface-1/70 p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-note/10 text-note">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Largest shelf
            </p>
          </div>
        </div>

        {largestCollection ? (
          <button
            type="button"
            className="mt-4 w-full rounded-sm border border-hairline-soft bg-transparent p-3 text-left transition-colors hover:border-primary/30 hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            onClick={() => onOpenCollection(largestCollection.id)}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {largestCollection.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bookmarkLabel(largestCount)}
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-note transition-all duration-700 ease-out"
                style={{ width: `${largestWidth}%` }}
              />
            </div>
          </button>
        ) : (
          <div className="mt-4 rounded-sm border border-dashed border-hairline-soft bg-transparent p-3 text-sm text-muted-foreground">
            No shelves yet
          </div>
        )}
      </div>
    </section>
  );
}

function CollectionMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "primary" | "note" | "success" | "muted";
}) {
  const toneClassName = {
    primary: "bg-primary/10 text-primary",
    note: "bg-note/10 text-note",
    success: "bg-success/10 text-success",
    muted: "bg-surface-3 text-muted-foreground",
  }[tone];

  return (
    <div className="rounded-sm border border-hairline-soft bg-transparent px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-7 w-7 items-center justify-center rounded-sm ${toneClassName}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {value}
        </span>
      </div>
      <p className="mt-2 truncate text-xs font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function CollectionsControlBar({
  searchQuery,
  activeFilter,
  totalCount,
  userCount,
  publicCount,
  xFolderCount,
  filteredCount,
  hasActiveFilters,
  searchInputRef,
  onSearchChange,
  onFilterChange,
  onClear,
}: {
  searchQuery: string;
  activeFilter: CollectionFilter;
  totalCount: number;
  userCount: number;
  publicCount: number;
  xFolderCount: number;
  filteredCount: number;
  hasActiveFilters: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: CollectionFilter) => void;
  onClear: () => void;
}) {
  const filters: Array<{
    value: CollectionFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "All", count: totalCount },
    { value: "mine", label: "Mine", count: userCount },
    { value: "public", label: "Public", count: publicCount },
    { value: "x_folders", label: "X", count: xFolderCount },
  ];

  return (
    <section className="flex flex-col gap-3 border-y border-hairline-soft py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm border border-hairline-strong bg-background/35 px-3 text-sm text-muted-foreground focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/20 lg:max-w-md">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          ref={searchInputRef}
          aria-label="Search collections"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search collections..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {searchQuery ? (
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          aria-label="Collection filters"
          className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-sm border border-hairline-soft bg-background/35 p-0.5"
        >
          {filters.map((filter) => {
            const active = filter.value === activeFilter;
            return (
              <FilterChip
                key={filter.value}
                active={active}
                onClick={() => onFilterChange(filter.value)}
                className={active ? "border-primary bg-primary text-primary-foreground" : undefined}
              >
                <span>{filter.label}</span>
                <span
                  className={`tabular-nums ${
                    active
                      ? "text-primary-foreground/75"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {filter.count}
                </span>
              </FilterChip>
            );
          })}
        </div>

        <span className="text-xs tabular-nums text-muted-foreground/70">
          {filteredCount.toLocaleString()} shown
        </span>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function CollectionsSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {count}
        </span>
      </div>
      <div className="grid gap-2 xl:grid-cols-2">{children}</div>
    </section>
  );
}


function NoCollectionMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-sm border border-dashed border-hairline-soft bg-surface-1/60 px-6 py-10 text-center">
      <Search className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold text-foreground">
        No matching collections
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Try a different search or filter.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={onClear}
      >
        Clear filters
      </Button>
    </div>
  );
}
