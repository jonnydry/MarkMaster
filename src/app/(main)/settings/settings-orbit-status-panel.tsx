"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatRow } from "@/components/ui/stat-row";
import { fetchJson } from "@/lib/fetch-json";
import { orbitXaiStatusPayloadSchema } from "@/lib/api-response-schemas";
import { cn } from "@/lib/utils";
import type { OrbitScanFailureCode, OrbitXaiStatusPayload } from "@/types";

export function parseOrbitIssue(value: string | null): OrbitScanFailureCode | null {
  return value === "xai_auth" || value === "xai_model" ? value : null;
}

export function buildOrbitStatusUrl(issue: OrbitScanFailureCode | null) {
  if (!issue) return "/api/orbit/status";
  const params = new URLSearchParams({ lastFailure: issue });
  return `/api/orbit/status?${params.toString()}`;
}

export function useOrbitStatusQuery(orbitIssue: OrbitScanFailureCode | null) {
  return useQuery({
    queryKey: ["orbit", "xai-status", orbitIssue],
    queryFn: () =>
      fetchJson(
        buildOrbitStatusUrl(orbitIssue),
        undefined,
        orbitXaiStatusPayloadSchema
      ),
    staleTime: 30_000,
  });
}

export function OrbitGrokStatusPanel({
  status,
  loading,
  error,
  onRetry,
}: {
  status: OrbitXaiStatusPayload | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded-sm skeleton-shimmer" />
        ))}
      </dl>
    );
  }

  if (error || !status) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {error?.message ?? "Orbit status could not be checked."}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const privacyLabel = status.privacy.storeDisabled
    ? "Response storage off"
    : "Response storage on";
  // Only qualify with retention when xAI affirmatively reports it. When it's
  // undetermined, showing "Retention unknown" reads as a warning without adding
  // information — let the accurate storage label stand on its own instead.
  const zeroDataRetentionLabel =
    status.privacy.zeroDataRetention === true
      ? "Zero retention"
      : status.privacy.zeroDataRetention === false
        ? "Retention active"
        : null;
  const privacyValue = zeroDataRetentionLabel
    ? `${privacyLabel} · ${zeroDataRetentionLabel}`
    : privacyLabel;

  return (
    <div className="space-y-3">
      {status.issues.length > 0 ? (
        <div className="rounded-sm border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-100" />
            <div className="space-y-2">
              {status.issues.map((issue) => (
                <div key={issue.code}>
                  <p className="text-sm font-medium text-foreground">{issue.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {issue.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <StatRow
          size="sm"
          headingFont={false}
          tabularNums={false}
          valueClassName="break-words text-foreground"
          label="Model"
          value={`${status.model}${status.modelSource === "environment" ? " · env" : ""}`}
        />
        <StatRow
          size="sm"
          headingFont={false}
          tabularNums={false}
          valueClassName="break-words text-foreground"
          label="Privacy"
          value={privacyValue}
        />
        <StatRow
          size="sm"
          headingFont={false}
          tabularNums={false}
          className={cn(!status.apiKeyConfigured && "text-amber-800 dark:text-amber-100")}
          valueClassName="break-words text-foreground"
          label="xAI key"
          value={status.apiKeyConfigured ? "Configured" : "Missing"}
        />
        <StatRow
          size="sm"
          headingFont={false}
          tabularNums={false}
          valueClassName="break-words text-foreground"
          label="Endpoint"
          value={`${status.baseUrl}${status.baseUrlSource === "environment" ? " · env" : ""}`}
        />
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onRetry}>
          Refresh
        </Button>
        <Link
          href="/orbit"
          className="inline-flex h-8 items-center rounded-sm border border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
        >
          Open Orbit queue
        </Link>
      </div>
    </div>
  );
}
