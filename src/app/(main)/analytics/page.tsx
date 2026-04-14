"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Bookmark, Tag, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNav } from "@/components/user-nav";
import type {
  AnalyticsData,
} from "@/types";
import type { DbUser } from "@/lib/auth";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

const RechartsCharts = dynamic(
  () => import("./recharts-charts").then((m) => m.RechartsCharts),
  { ssr: false }
);

export default function AnalyticsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: () => fetchJson("/api/analytics"),
  });

  const { data: tags = [] } = useTagsQuery();

  const { data: collections = [] } = useCollectionsQuery();

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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
          onSyncComplete={() => {
            void invalidateLibraryQueries(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          }}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-border px-5 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MobileSidebar
                tags={tags}
                collections={collections}
                selectedTags={[]}
                onTagToggle={goToTagOnDashboard}
                onCreateCollection={() => setCreateOpen(true)}
                onSyncComplete={() => {
                  void invalidateLibraryQueries(queryClient);
                  void queryClient.invalidateQueries({ queryKey: ["analytics"] });
                }}
              />
              <h1 className="text-xl font-bold tracking-tight heading-font">Analytics</h1>
            </div>
            {session?.dbUser && (
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <UserNav user={session.dbUser} />
              </div>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="h-24 bg-muted rounded-lg animate-pulse" />
                <div className="h-24 bg-muted rounded-lg animate-pulse" />
                <div className="h-24 bg-muted rounded-lg animate-pulse" />
              </div>
            </div>
          ) : isError || !analytics ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
              <p className="text-lg font-medium">Analytics could not be loaded</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </p>
              <Button size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
<div className="grid sm:grid-cols-3 gap-3">
                <Card className="p-4 animate-fade-in stagger-1">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bookmark className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold heading-font">
                        {analytics.totalBookmarks.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Total Bookmarks
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 animate-fade-in stagger-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald/10 flex items-center justify-center">
                      <Tag className="w-5 h-5 text-emerald" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold heading-font">{analytics.totalTags}</p>
                      <p className="text-xs text-muted-foreground">Tags</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 animate-fade-in stagger-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-note/10 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-note" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold heading-font">
                        {analytics.totalCollections}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Collections
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              <RechartsCharts analytics={analytics} />
            </>
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
