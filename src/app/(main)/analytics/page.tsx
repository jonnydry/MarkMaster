"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Bookmark, Tag, FolderOpen, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { Sidebar } from "@/components/sidebar";
import { SyncButton } from "@/components/sync-button";
import { UserNav } from "@/components/user-nav";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
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

const PIE_COLORS = ["#3b82f6", "#60a5fa", "#71717a"];

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
              <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
            </div>
            {session?.dbUser && (
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <SyncButton
                  lastSyncAt={
                    session.dbUser.lastSyncAt
                      ? new Date(session.dbUser.lastSyncAt)
                      : null
                  }
                  onSyncComplete={() => {
                    void invalidateLibraryQueries(queryClient);
                    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
                  }}
                />
                <UserNav user={session.dbUser} />
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
              <div className="grid sm:grid-cols-3 gap-4">
                <Card className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bookmark className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {analytics.totalBookmarks.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Total Bookmarks
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Tag className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{analytics.totalTags}</p>
                      <p className="text-xs text-muted-foreground">Tags</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {analytics.totalCollections}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Collections
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Top Authors
                  </h2>
                  {analytics.topAuthors.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No data yet
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={analytics.topAuthors}
                        layout="vertical"
                        margin={{ left: 80 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
                        <XAxis type="number" stroke="var(--muted-foreground)" />
                        <YAxis
                          type="category"
                          dataKey="author"
                          stroke="var(--muted-foreground)"
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="var(--primary)"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                <Card className="p-5">
                  <h2 className="font-semibold mb-4">Content Breakdown</h2>
                  {analytics.mediaBreakdown.every((m) => m.count === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No data yet
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.mediaBreakdown.filter(
                            (m) => m.count > 0
                          )}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="type"
                          label={({ name, percent }: PieLabelRenderProps) =>
                            `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {analytics.mediaBreakdown
                            .filter((m) => m.count > 0)
                            .map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                <Card className="p-5 lg:col-span-2">
                  <h2 className="font-semibold mb-4">Bookmarks Over Time</h2>
                  {analytics.bookmarksByMonth.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No data yet
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={analytics.bookmarksByMonth}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="month"
                          stroke="var(--muted-foreground)"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke="var(--muted-foreground)" />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={{ fill: "var(--primary)", r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                {analytics.tagDistribution.length > 0 && (
                  <Card className="p-5 lg:col-span-2">
                    <h2 className="font-semibold mb-4">Tag Distribution</h2>
                    <div className="flex flex-wrap gap-3">
                      {analytics.tagDistribution.map((t) => (
                        <div
                          key={t.tag}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border"
                        >
                          <span className="text-sm font-medium text-foreground">
                            {t.tag}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
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
