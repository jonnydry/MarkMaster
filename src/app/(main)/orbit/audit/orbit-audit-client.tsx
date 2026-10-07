"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AppPageShell } from "@/components/app-page-shell";
import { useAppChrome } from "@/components/app-frame";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { OrbitModeSwitch } from "@/components/orbit/orbit-mode-switch";
import { PageHeader } from "@/components/page-header";
import { TagDot } from "@/components/tag-dot";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { FetchJsonError, fetchJson, sendJson } from "@/lib/fetch-json";

type OutstandingUndoChoice = "release" | "block";

type TagAuditSuggestion =
  | { kind: "remove" }
  | { kind: "swap"; tagId: string; name: string; color: string };

type TagAuditProposal = {
  id: string;
  bookmarkId: string;
  authorUsername: string;
  excerpt: string;
  currentTag: { id: string; name: string; color: string };
  suggestion: TagAuditSuggestion;
  reason: string;
  checked: boolean;
};

type TagAuditResponse = {
  auditId: string;
  phase: "open" | "applied" | "undone";
  coverageSentence: string;
  undoAvailable: boolean;
  proposals: TagAuditProposal[];
};

type PageStatus = "loading" | "ready" | "running" | "error";

function errorMessage(error: unknown): string {
  if (error instanceof FetchJsonError) return error.message;
  if (error instanceof Error) return error.message;
  return "Tag audit failed.";
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof FetchJsonError)) return undefined;
  if (!error.body || typeof error.body !== "object" || !("code" in error.body)) {
    return undefined;
  }
  const code = error.body.code;
  return typeof code === "string" ? code : undefined;
}

function suggestionLabel(suggestion: TagAuditSuggestion): string {
  if (suggestion.kind === "remove") return "Remove";
  return `Swap to ${suggestion.name}`;
}

export default function OrbitAuditClient() {
  const router = useRouter();
  const { openCreateCollection } = useAppChrome();
  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [view, setView] = useState<TagAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [releasePrompt, setReleasePrompt] = useState(false);
  const [busy, setBusy] = useState<"apply" | "undo" | "check" | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await fetchJson<TagAuditResponse | null>("/api/orbit/tag-audit");
      if (id !== requestId.current) return;
      setView(next);
      setStatus("ready");
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(errorMessage(caught));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const id = ++requestId.current;
    fetchJson<TagAuditResponse | null>("/api/orbit/tag-audit")
      .then((next) => {
        if (id !== requestId.current) return;
        setView(next);
        setStatus("ready");
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        setError(errorMessage(caught));
        setStatus("error");
      });
  }, []);

  const run = useCallback(
    async (outstandingUndo: OutstandingUndoChoice) => {
      const id = ++requestId.current;
      setStatus("running");
      setError(null);
      setReleasePrompt(false);
      try {
        const next = await sendJson<TagAuditResponse>("/api/orbit/tag-audit", {
          method: "POST",
          body: { outstandingUndo },
        });
        if (id !== requestId.current) return;
        setView(next);
        setStatus("ready");
      } catch (caught) {
        if (id !== requestId.current) return;
        if (errorCode(caught) === "undo_outstanding") {
          setReleasePrompt(true);
          setStatus("ready");
          setError("Undo is still available. Keep the last changes to review again.");
          return;
        }
        setError(errorMessage(caught));
        setStatus(view ? "ready" : "error");
      }
    },
    [view],
  );

  const onReview = () => {
    if (view?.undoAvailable) {
      setReleasePrompt(true);
      return;
    }
    void run("block");
  };

  const onToggle = async (proposalId: string, checked: boolean) => {
    if (!view || view.phase !== "open") return;
    const checkedProposalIds = view.proposals
      .filter((proposal) =>
        proposal.id === proposalId ? checked : proposal.checked,
      )
      .map((proposal) => proposal.id);
    setBusy("check");
    setError(null);
    try {
      const next = await sendJson<TagAuditResponse>("/api/orbit/tag-audit", {
        method: "PATCH",
        body: { auditId: view.auditId, checkedProposalIds },
      });
      setView(next);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const onApply = async () => {
    if (!view) return;
    const checkedProposalIds = view.proposals
      .filter((proposal) => proposal.checked)
      .map((proposal) => proposal.id);
    setBusy("apply");
    setError(null);
    try {
      await sendJson("/api/orbit/tag-audit/apply", {
        method: "POST",
        body: { auditId: view.auditId, checkedProposalIds },
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const onUndo = async () => {
    if (!view) return;
    setBusy("undo");
    setError(null);
    try {
      await sendJson("/api/orbit/tag-audit/undo", {
        method: "POST",
        body: { auditId: view.auditId },
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const checkedCount = view?.proposals.filter((proposal) => proposal.checked).length ?? 0;
  const canApply = view?.phase === "open" && checkedCount > 0 && busy === null;

  return (
    <AppPageShell embedded>
      <PageHeader
        sticky
        title="Tag audit"
        description={view?.coverageSentence}
        leading={
          <MobileSidebar
            tags={tags}
            collections={collections}
            selectedTags={[]}
            onTagToggle={(tagId) => {
              router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
            }}
            onCreateCollection={openCreateCollection}
          />
        }
        actions={
          <>
            <OrbitModeSwitch active="audit" />
            {view?.undoAvailable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null || status === "running"}
                onClick={() => void onUndo()}
              >
                Undo
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status === "loading" || status === "running" || busy !== null}
              onClick={onReview}
            >
              {view ? "Review again" : "Review tags"}
            </Button>
            {view?.phase === "open" && view.proposals.length > 0 ? (
              <Button
                type="button"
                size="sm"
                disabled={!canApply}
                onClick={() => void onApply()}
              >
                Apply
              </Button>
            ) : null}
          </>
        }
      />

      <div className={bookmarkFeedColumnClassName}>
        {error ? (
          <p className="border-b border-hairline-soft px-4 py-3 text-sm text-destructive sm:px-5" role="alert">
            {error}
          </p>
        ) : null}

        {releasePrompt ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline-soft px-4 py-3 sm:px-5">
            <p className="min-w-0 flex-1 text-sm text-foreground">
              Undo can still restore the last apply. Keep those tag changes and review again?
            </p>
            <Button
              type="button"
              size="sm"
              disabled={status === "running"}
              onClick={() => void run("release")}
            >
              Keep changes and review again
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReleasePrompt(false)}
            >
              Stay blocked
            </Button>
          </div>
        ) : null}

        {status === "loading" || status === "running" ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-5" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            {status === "running" ? "Reviewing tagged bookmarks." : "Loading the tag review."}
          </div>
        ) : status === "error" && !view ? (
          <ErrorState
            title="Tag review failed"
            description={error ?? "The tag review could not be loaded."}
            action={<RetryButton onClick={() => void load()} />}
          />
        ) : !view ? (
          <EmptyState
            title="No tag review yet"
            description="Score the tags already on your bookmarks. Nothing changes until you apply."
            action={
              <Button type="button" size="sm" onClick={() => void run("block")}>
                Review tags
              </Button>
            }
          />
        ) : view.proposals.length === 0 ? (
          <EmptyState
            layout="inline"
            title="No tags to change"
            description="This review did not find a weak tag or a clearly better existing tag."
          />
        ) : (
          <ul>
            {view.proposals.map((proposal) => (
              <li key={proposal.id} className="border-b border-hairline-soft">
                <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <Checkbox
                    className="mt-1"
                    checked={proposal.checked}
                    disabled={view.phase !== "open" || busy !== null}
                    aria-label={`${suggestionLabel(proposal.suggestion)} ${proposal.currentTag.name}`}
                    onCheckedChange={(checked) => {
                      void onToggle(proposal.id, checked === true);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-5 text-foreground">{proposal.excerpt}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      @{proposal.authorUsername}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <TagDot
                          name={proposal.currentTag.name}
                          color={proposal.currentTag.color}
                          size={8}
                        />
                        {proposal.currentTag.name}
                      </span>
                      {proposal.suggestion.kind === "swap" ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          Swap to
                          <TagDot
                            name={proposal.suggestion.name}
                            color={proposal.suggestion.color}
                            size={8}
                          />
                          <span className="font-medium text-foreground">
                            {proposal.suggestion.name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Remove</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{proposal.reason}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppPageShell>
  );
}
