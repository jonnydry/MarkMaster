"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Bookmark, Tag, FolderOpen, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sidebar } from "@/components/sidebar";
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
import type { AnalyticsData, TagWithCount, CollectionWithCount } from "@/types";
import type { DbUser } from "@/lib/auth";

const PIE_COLORS = ["#1d9bf0", "#3babf3", "#52525b"];

export default function AnalyticsPage() {
  const { data: session } = useSession() as {
    data: { dbUser?: DbUser } | null;
  };

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics");
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

  const { data: collections = [] } = useQuery<CollectionWithCount[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await fetch("/api/collections");
      return res.json();
    },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tags={tags}
        collections={collections}
        selectedTags={[]}
        onTagToggle={() => {}}
        onCreateCollection={() => {}}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border flex items-center justify-between px-8 py-5 shrink-0">
          <h1 className="text-2xl font-extrabold tracking-[-0.04em]">Analytics</h1>
          {session?.dbUser && <UserNav user={session.dbUser} />}
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading || !analytics ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                      <p className="text-2xl font-bold">
                        {analytics.totalTags}
                      </p>
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
                            borderRadius: "8px",
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
                            borderRadius: "8px",
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
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border"
                        >
                          <span className="text-sm font-medium text-[#a1a1aa]">{t.tag}</span>
                          <span className="text-xs text-[#3f3f46]">
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
    </div>
  );
}
