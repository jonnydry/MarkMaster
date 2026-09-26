"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { isKeptRoute, KeptRoutes } from "@/components/kept-routes";
import { noteVisiblePath, RoutePreviewProvider } from "@/components/route-preview";
import { OrbitPageWatermark } from "@/components/orbit/orbit-page-watermark";
import { Sidebar } from "@/components/sidebar-dynamic";
import { ScrollingProgressBar } from "@/components/ui/scrolling-progress-bar";
import { useCreateCollection } from "@/hooks/use-create-collection";
import {
  useCollectionsQuery,
  useLibraryStatsQuery,
  useTagsQuery,
} from "@/hooks/use-library-data";
import { useSyncStatus } from "@/hooks/use-sync-status";
import type { SessionWithUser } from "@/lib/auth";
import {
  appPageMainClassName,
  appPageShellClassName,
  appPageSidebarClassName,
} from "@/lib/app-layout";
import { completeLibrarySync } from "@/lib/library-sync";
import { cn } from "@/lib/utils";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (module) => module.CreateCollectionDialog
    ),
  { ssr: false }
);

type DashboardTagBridge = {
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
};

type AppChromeContextValue = {
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  registerDashboardTags: (bridge: DashboardTagBridge | null) => void;
  openCreateCollection: () => void;
  setSyncing: (syncing: boolean) => void;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function useAppChrome() {
  const value = useContext(AppChromeContext);
  if (!value) {
    throw new Error("useAppChrome must be used inside AppFrame");
  }
  return value;
}

function sameTags(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function PersistentSidebar({ preferCollapsed }: { preferCollapsed: boolean }) {
  const queryClient = useQueryClient();
  const { data: session, update } = useSession() as {
    data: SessionWithUser | null;
    update: (data?: { refresh: string }) => Promise<unknown>;
  };
  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();
  const { data: libraryStats } = useLibraryStatsQuery();
  const { selectedTags, onTagToggle, openCreateCollection, setSyncing } = useAppChrome();

  const lastSyncAt = session?.dbUser?.lastSyncAt
    ? new Date(session.dbUser.lastSyncAt)
    : null;

  const onSyncComplete = useCallback(() => {
    return completeLibrarySync(queryClient, {
      updateSession: () => update({ refresh: "lastSyncAt" }),
    });
  }, [queryClient, update]);

  return (
    <Sidebar
      tags={tags}
      collections={collections}
      selectedTags={selectedTags}
      onTagToggle={onTagToggle}
      onCreateCollection={openCreateCollection}
      preferCollapsed={preferCollapsed}
      lastSyncAt={lastSyncAt}
      totalBookmarks={libraryStats?.libraryBookmarkCount}
      onSyncComplete={() => {
        void onSyncComplete();
      }}
      onSyncStateChange={setSyncing}
    />
  );
}

function isCollectionDetailPath(pathname: string) {
  return /^\/collections\/[^/]+/.test(pathname);
}

/**
 * Authenticated chrome that stays mounted across navigations.
 * The sidebar does not unmount when the main column swaps.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [previewRoute, setPreviewRoute] = useState<string | null>(null);
  const shownPath = previewRoute ?? pathname;
  noteVisiblePath(shownPath);
  useEffect(() => {
    if (!previewRoute) return;
    if (previewRoute === pathname) {
      setPreviewRoute(null);
      return;
    }
    const timer = window.setTimeout(() => setPreviewRoute(null), 2000);
    return () => window.clearTimeout(timer);
  }, [pathname, previewRoute]);
  const showRoute = useCallback((href: string) => {
    if (!isKeptRoute(href)) return;
    if (href === pathname) {
      setPreviewRoute(null);
      return;
    }
    setPreviewRoute(href);
  }, [pathname]);
  const { createCollection } = useCreateCollection();
  const syncStatus = useSyncStatus();
  const [dashboardTags, setDashboardTags] = useState<DashboardTagBridge | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const onDashboard = shownPath === "/dashboard";
  const orbitRoute = shownPath === "/orbit" || shownPath.startsWith("/orbit/");
  const hideSidebar = isCollectionDetailPath(pathname);
  const syncActive = syncing || Boolean(syncStatus.data?.currentRun);

  const registerDashboardTags = useCallback((bridge: DashboardTagBridge | null) => {
    setDashboardTags((current) => {
      if (bridge === null) return current === null ? current : null;
      if (
        current &&
        current.onTagToggle === bridge.onTagToggle &&
        sameTags(current.selectedTags, bridge.selectedTags)
      ) {
        return current;
      }
      return bridge;
    });
  }, []);

  const onTagToggle = useCallback(
    (tagId: string) => {
      if (onDashboard) {
        dashboardTags?.onTagToggle(tagId);
        return;
      }
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [dashboardTags, onDashboard, router]
  );

  const openCreateCollection = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const chrome = useMemo<AppChromeContextValue>(
    () => ({
      selectedTags: onDashboard ? (dashboardTags?.selectedTags ?? []) : [],
      onTagToggle,
      registerDashboardTags,
      openCreateCollection,
      setSyncing,
    }),
    [
      dashboardTags?.selectedTags,
      onDashboard,
      onTagToggle,
      openCreateCollection,
      registerDashboardTags,
    ]
  );

  const routePreview = useMemo(
    () => ({ shownPath, showRoute }),
    [shownPath, showRoute]
  );

  return (
    <AppChromeContext.Provider value={chrome}>
    <RoutePreviewProvider value={routePreview}>
      <div
        className={cn(
          appPageShellClassName,
          orbitRoute && "orbit-route-default"
        )}
      >
        {orbitRoute ? <OrbitPageWatermark /> : null}
        <div className={cn(appPageSidebarClassName, hideSidebar && "md:hidden")}>
          <PersistentSidebar preferCollapsed={pathname === "/orbit/map"} />
        </div>
        <div className={appPageMainClassName} aria-busy={syncActive || undefined}>
          {syncActive ? <ScrollingProgressBar className="relative z-50" /> : null}
          <KeptRoutes pathname={shownPath} />
          {isKeptRoute(shownPath) ? null : children}
        </div>
      </div>
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={createCollection}
      />
    </RoutePreviewProvider>
    </AppChromeContext.Provider>
  );
}
