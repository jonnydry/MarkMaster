"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, ListChecks, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatRow } from "@/components/ui/stat-row";
import { appOverlayDialogSmClassName } from "@/lib/app-layout";
import { fetchJson, sendJson } from "@/lib/fetch-json";
import {
  orbitLibraryClassifyQueueSchema,
  orbitLibraryClassifyResultSchema,
  orbitXaiStatusPayloadSchema,
} from "@/lib/api-response-schemas";
import { invalidateOrbitApplyQueries } from "@/lib/query-invalidation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { OrbitScanFailureCode, OrbitXaiStatusPayload } from "@/types";

export function parseOrbitIssue(value: string | null): OrbitScanFailureCode | null {
  return value === "xai_auth" || value === "xai_model" || value === "typesafe_auth"
    ? value
    : null;
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
        {Array.from({ length: 6 }).map((_, i) => (
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
          label="Grok model"
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
          className={cn(
            !status.typesafe.apiKeyConfigured && "text-amber-800 dark:text-amber-100"
          )}
          valueClassName="break-words text-foreground"
          label="TypeSafe key"
          value={status.typesafe.apiKeyConfigured ? "Configured" : "Missing"}
        />
        <StatRow
          size="sm"
          headingFont={false}
          tabularNums={false}
          valueClassName="break-words text-foreground"
          label="Endpoint"
          value={`${status.baseUrl}${status.baseUrlSource === "environment" ? " · env" : ""}`}
        />
        <StatRow
          size="sm"
          headingFont={false}
          tabularNums={false}
          valueClassName="break-words text-foreground"
          label="Jev model"
          value={`${status.typesafe.model}${
            status.typesafe.modelSource === "environment" ? " · env" : ""
          }`}
        />
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onRetry}>
          Refresh
        </Button>
        <OrbitLibraryClassifyButton enabled={status.typesafe.apiKeyConfigured} />
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

type OrbitLibraryClassifyLastRun = {
  applied: number;
  skippedReview: number;
  remaining: number;
  continued: boolean;
};

function OrbitLibraryClassifyButton({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastRun, setLastRun] = useState<OrbitLibraryClassifyLastRun | null>(
    null
  );
  const queueQuery = useQuery({
    queryKey: ["orbit", "library-classify-queue"],
    queryFn: () =>
      fetchJson(
        "/api/orbit/library-classify",
        undefined,
        orbitLibraryClassifyQueueSchema
      ),
    enabled,
    staleTime: 30_000,
  });
  const untaggedCount = queueQuery.data?.untaggedCount;
  const label =
    typeof untaggedCount === "number"
      ? `Classify ${untaggedCount.toLocaleString()} in Orbit`
      : "Classify library";

  const startClassify = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const result = await sendJson("/api/orbit/library-classify", {
        method: "POST",
        body: {},
        schema: orbitLibraryClassifyResultSchema,
      });
      await invalidateOrbitApplyQueries(queryClient);
      await queryClient.invalidateQueries({
        queryKey: ["orbit", "library-classify-queue"],
      });
      setLastRun({
        applied: result.applied,
        skippedReview: result.skippedReview,
        remaining: result.remaining,
        continued: result.continued,
      });
      const summary = `Applied ${result.applied} · skipped ${result.skippedReview} · ${result.remaining} left`;
      toast.success(
        result.continued
          ? `Library classify is draining in the background · ${summary}`
          : `Library classify finished · ${summary}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Library classify could not start."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!enabled || busy || untaggedCount === 0}
        title={
          enabled
            ? "Tags untagged bookmarks in the background using safe matches only."
            : "Set TYPESAFE_API_KEY to classify the library"
        }
        onClick={() => setConfirmOpen(true)}
      >
        {busy ? "Classifying…" : label}
      </Button>
      {busy || lastRun ? (
        <p className="w-full text-xs text-muted-foreground">
          {busy
            ? "Classifying bookmarks in Orbit — safe matches are applied as they land."
            : lastRun
              ? `${
                  lastRun.continued
                    ? "Still draining in the background"
                    : "Last run finished"
                } · tagged ${lastRun.applied.toLocaleString()} · left ${lastRun.skippedReview.toLocaleString()} for review · ${lastRun.remaining.toLocaleString()} still in Orbit`
              : null}
        </p>
      ) : null}
      <OrbitLibraryClassifyConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        untaggedCount={untaggedCount}
        onConfirm={startClassify}
      />
    </>
  );
}

function OrbitLibraryClassifyConfirmDialog({
  open,
  onOpenChange,
  untaggedCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  untaggedCount: number | undefined;
  onConfirm: () => void;
}) {
  const countLabel =
    typeof untaggedCount === "number"
      ? untaggedCount.toLocaleString()
      : "your";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={appOverlayDialogSmClassName}>
        <div className="p-4">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Classify {countLabel}{" "}
              {untaggedCount === 1 ? "bookmark" : "bookmarks"} in Orbit?
            </DialogTitle>
            <DialogDescription>
              A background pass over everything in your library that has no
              tags yet.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-2">
            <ClassifyDetail
              icon={Tags}
              title="Reuses your existing tags only"
              description="Only high-confidence matches to tags you already have are applied — nothing new is invented. Anything uncertain stays in the Orbit queue."
            />
            <ClassifyDetail
              icon={Clock3}
              title="Runs in the background"
              description="You can keep using MarkMaster; large libraries drain over several passes."
            />
            <ClassifyDetail
              icon={ListChecks}
              title="Review the results in Orbit"
              description="Newly tagged bookmarks appear in your library; leftovers wait in the Orbit queue for manual review."
            />
          </div>
        </div>

        <DialogFooter className="m-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
          <Button type="button" variant="highlight" onClick={onConfirm}>
            Classify {countLabel} bookmark{untaggedCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassifyDetail({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Tags;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 surface-inset p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
