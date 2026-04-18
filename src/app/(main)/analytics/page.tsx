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
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
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

  const stats = analytics
    ? [
        {
          label: "Total Bookmarks",
          value: analytics.totalBookmarks.toLocaleString(),
          tone: "primary",
          icon: Bookmark,
          note: "Saved across your library",
        },
        {
          label: "Tags",
          value: analytics.totalTags.toLocaleString(),
          tone: "emerald",
          icon: Tag,
          note: "Active organization labels",
        },
        {
          label: "Collections",
          value: analytics.totalCollections.toLocaleString(),
          tone: "note",
          icon: FolderOpen,
          note: "Curated sets and X folders",
        },
      ]
    : [];

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
          onSyncComplete={() => {
            void invalidateLibraryQueries(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          }}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader
          title="Analytics"
          description="Overview of bookmark volume, content mix, and author trends"
          leading={
            <div className="md:hidden">
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
            </div>
          }
          actions={
            session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : undefined
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="h-24 bg-muted rounded-lg animate-pulse" />
                <div className="h-24 bg-muted rounded-lg animate-pulse" />
                <div className="h-24 bg-muted rounded-lg animate-pulse" />
              </div>
            </div>
          ) : isError || !analytics ? (
            <div className="flex h-72 items-center justify-center text-center">
              <div className="rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 shadow-sm sm:px-8">
              <p className="text-lg font-medium">Analytics could not be loaded</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </p>
              <Button size="sm" className="mt-4" onClick={() => refetch()}>
                Retry
              </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {stats.map(({ label, value, tone, icon: Icon, note }, index) => (
                  <Card
                    key={label}
                    className={`animate-fade-in border-hairline-soft bg-surface-1 p-5 shadow-sm stagger-${Math.min(index + 1, 3)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-2 text-3xl font-bold tracking-tight heading-font">{value}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                      </div>
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          tone === "primary"
                            ? "bg-primary/10 text-primary"
                            : tone === "emerald"
                              ? "bg-emerald/10 text-emerald"
                              : "bg-note/10 text-note"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <RechartsCharts analytics={analytics} />
            </>
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
