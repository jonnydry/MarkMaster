"use client";

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
import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { AnalyticsData } from "@/types";

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function RechartsCharts({ analytics }: { analytics: AnalyticsData }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-4">
        <h2 className="text-base font-semibold heading-font mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Top Authors
          <span className="ml-auto text-xs font-normal text-muted-foreground">{analytics.topAuthors.length} authors</span>
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

      <Card className="p-4">
        <h2 className="text-base font-semibold heading-font mb-3">Content Breakdown</h2>
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

      <Card className="p-4 lg:col-span-2">
        <h2 className="text-base font-semibold heading-font mb-3">Bookmarks Over Time</h2>
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
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-base font-semibold heading-font mb-3">Tag Distribution</h2>
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
  );
}