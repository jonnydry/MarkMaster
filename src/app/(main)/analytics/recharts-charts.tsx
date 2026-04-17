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

const chartCardClass =
  "border-hairline-soft bg-surface-1 p-5 shadow-sm";

const tooltipStyle = {
  background: "var(--surface-elevated)",
  border: "1px solid var(--hairline-strong)",
  borderRadius: "0.875rem",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
  color: "var(--foreground)",
};

function ChartHeading({
  title,
  icon,
  meta,
}: {
  title: string;
  icon?: React.ReactNode;
  meta?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {icon}
      <h2 className="text-base font-semibold heading-font">{title}</h2>
      {meta ? <span className="ml-auto text-xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-hairline-soft bg-surface-2 text-sm text-muted-foreground">
      No data yet
    </div>
  );
}

export function RechartsCharts({ analytics }: { analytics: AnalyticsData }) {
  const mediaBreakdown = analytics.mediaBreakdown.filter((item) => item.count > 0);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className={chartCardClass}>
        <ChartHeading
          title="Top Authors"
          icon={<TrendingUp className="w-4 h-4 text-primary" />}
          meta={`${analytics.topAuthors.length} authors`}
        />
        {analytics.topAuthors.length === 0 ? (
          <EmptyChartState />
        ) : (
          <div className="rounded-2xl border border-hairline-soft bg-surface-2 px-3 py-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={analytics.topAuthors}
                layout="vertical"
                margin={{ left: 80, right: 12, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" />
                <XAxis type="number" stroke="var(--muted-foreground)" />
                <YAxis
                  type="category"
                  dataKey="author"
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
                <Bar dataKey="count" fill="var(--primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className={chartCardClass}>
        <ChartHeading title="Content Breakdown" />
        {mediaBreakdown.length === 0 ? (
          <EmptyChartState />
        ) : (
          <div className="space-y-4 rounded-2xl border border-hairline-soft bg-surface-2 px-3 py-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mediaBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="type"
                >
                  {mediaBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex flex-wrap gap-2">
              {mediaBreakdown.map((item, index) => (
                <div
                  key={item.type}
                  className="flex items-center gap-2 rounded-xl border border-hairline-soft bg-surface-1 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  <span className="font-medium text-foreground">{item.type}</span>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className={`${chartCardClass} xl:col-span-2`}>
        <ChartHeading title="Bookmarks Over Time" />
        {analytics.bookmarksByMonth.length === 0 ? (
          <div className="h-[250px]">
            <EmptyChartState />
          </div>
        ) : (
          <div className="rounded-2xl border border-hairline-soft bg-surface-2 px-3 py-4">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={analytics.bookmarksByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" />
                <XAxis
                  dataKey="month"
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={{ fill: "var(--primary)", r: 4 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {analytics.tagDistribution.length > 0 && (
        <Card className={`${chartCardClass} xl:col-span-2`}>
          <ChartHeading title="Tag Distribution" />
          <div className="flex flex-wrap gap-3 rounded-2xl border border-hairline-soft bg-surface-2 p-3">
            {analytics.tagDistribution.map((t) => (
              <div
                key={t.tag}
                className="flex items-center gap-2 rounded-xl border border-hairline-soft bg-surface-1 px-3 py-1.5 shadow-sm"
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
