"use client";

import type { ReactNode } from "react";
import {
  ArchiveX,
  ArrowUpRight,
  FolderInput,
  Link2,
  RotateCcw,
  Sparkles,
  Tags,
} from "lucide-react";
import { toast } from "sonner";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import {
  BookmarkOverlayAuthorHeader,
  BookmarkOverlayCollectionsSection,
  BookmarkOverlayMetricsGrid,
  BookmarkOverlayPostColumn,
  BookmarkOverlaySectionLabel,
  BookmarkOverlayShell,
  BookmarkOverlaySidebar,
  BookmarkOverlayTagPill,
  BookmarkOverlayTagsSection,
  BookmarkOverlayToolButton,
} from "@/components/bookmark-overlay/bookmark-overlay-primitives";
import { getBookmarkTweetUrl, openBookmarkOnX } from "@/lib/bookmark-url";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

interface OrbitBookmarkOverlayProps {
  bookmark: BookmarkWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision?: OrbitBookmarkDecision | null;
  onFullReview?: (bookmarkId: string) => void;
  onDecision?: (bookmarkId: string, kind: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  showFullReview?: boolean;
  suggestionDismissed?: boolean;
}

function SuggestionBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-[0.08em]",
        tone === "primary" && "border-primary/30 bg-primary/10 text-primary",
        tone === "success" &&
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-500",
        tone === "neutral" &&
          "border-hairline-soft bg-surface-2/70 text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

export function OrbitBookmarkOverlay({
  bookmark,
  open,
  onOpenChange,
  decision,
  onFullReview,
  onDecision,
  onAddTag,
  onAddToCollection,
  showFullReview = false,
  suggestionDismissed = false,
}: OrbitBookmarkOverlayProps) {
  const tweetUrl = bookmark ? getBookmarkTweetUrl(bookmark) : undefined;
  const hasPrimarySuggestion = Boolean(decision?.primary);
  const suggestionStateLabel = suggestionDismissed
    ? "Suggestion skipped"
    : hasPrimarySuggestion
      ? "Suggestion ready"
      : "No suggestion";
  const applyLabel =
    decision?.primary?.kind === "collection"
      ? `Add to ${decision.primary.label}`
      : decision?.primary?.kind === "tag"
        ? `Apply tag · ${decision.primary.label}`
        : "Apply suggestion";

  const closeAndRun = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const handleCopyLink = () => {
    if (!tweetUrl) return;
    void navigator.clipboard.writeText(tweetUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy link")
    );
  };

  return (
    <BookmarkOverlayShell
      open={open}
      onOpenChange={onOpenChange}
      bookmark={bookmark}
      dataAttributeName="data-orbit-expanded-overlay"
      title={bookmark ? `Orbit review for ${bookmark.authorDisplayName}` : "Orbit review"}
      description="Review a bookmark and apply Orbit suggestions."
    >
      {bookmark ? (
        <>
          <BookmarkOverlayPostColumn
            bookmark={bookmark}
            textClassName="whitespace-pre-wrap break-words text-[17px] leading-8 text-foreground"
            header={
              <BookmarkOverlayAuthorHeader
                bookmark={bookmark}
                onClose={() => onOpenChange(false)}
                closeLabel="Close Orbit review"
                badges={
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-primary">
                      <OrbitLogoMark className="size-3" aria-hidden="true" />
                      Orbit
                    </span>
                    {hasPrimarySuggestion || suggestionDismissed ? (
                      <SuggestionBadge
                        tone={suggestionDismissed ? "primary" : "success"}
                      >
                        {suggestionStateLabel}
                      </SuggestionBadge>
                    ) : null}
                  </>
                }
              />
            }
          />
          <BookmarkOverlaySidebar>
            {bookmark.publicMetrics ? (
              <BookmarkOverlayMetricsGrid metrics={bookmark.publicMetrics} />
            ) : null}

            {hasPrimarySuggestion ? (
              <div className="mt-5 rounded-sm border border-primary/20 bg-primary/[0.07] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.08em] text-primary/80">
                      <GrokMark className="size-3.5" />
                      Grok suggestion
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-foreground">
                      {decision?.primary
                        ? decision.primary.kind === "collection"
                          ? `Add to ${decision.primary.label}`
                          : `Tag as ${decision.primary.label}`
                        : "No category move queued"}
                    </div>
                  </div>
                  <OrbitLogoMark className="mt-0.5 size-8 text-primary opacity-85" />
                </div>

                {decision?.reasoning ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {decision.reasoning}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {decision?.confidence ? (
                    <SuggestionBadge
                      tone={decision.confidence === "high" ? "success" : "primary"}
                    >
                      {decision.confidence} confidence
                    </SuggestionBadge>
                  ) : null}
                  {decision?.primary ? (
                    <SuggestionBadge tone="neutral">
                      {decision.primary.reuseExisting ? "Existing" : "New"}{" "}
                      {decision.primary.kind}
                    </SuggestionBadge>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <BookmarkOverlaySectionLabel>Orbit actions</BookmarkOverlaySectionLabel>
              <div className="grid gap-2">
                {hasPrimarySuggestion && onDecision ? (
                  <BookmarkOverlayToolButton
                    icon={Sparkles}
                    label={applyLabel}
                    tone="primary"
                    onClick={() =>
                      closeAndRun(() => onDecision(bookmark.id, "keep-tag"))
                    }
                  />
                ) : null}
                {suggestionDismissed && onDecision ? (
                  <BookmarkOverlayToolButton
                    icon={RotateCcw}
                    label="Restore suggestion"
                    onClick={() =>
                      closeAndRun(() => onDecision(bookmark.id, "dismiss"))
                    }
                  />
                ) : null}
                {onAddTag ? (
                  <BookmarkOverlayToolButton
                    icon={Tags}
                    label={bookmark.tags.length > 0 ? "Edit tags" : "Add tags"}
                    onClick={() => closeAndRun(() => onAddTag(bookmark.id))}
                  />
                ) : null}
                {onAddToCollection ? (
                  <BookmarkOverlayToolButton
                    icon={FolderInput}
                    label={
                      bookmark.collectionItems.length > 0
                        ? "Change collection"
                        : "Add to collection"
                    }
                    onClick={() =>
                      closeAndRun(() => onAddToCollection(bookmark.id))
                    }
                  />
                ) : null}
                {hasPrimarySuggestion && showFullReview && onFullReview ? (
                  <BookmarkOverlayToolButton
                    icon={OrbitLogoMark}
                    label="Open review pass"
                    onClick={() => closeAndRun(() => onFullReview(bookmark.id))}
                  />
                ) : null}
                <BookmarkOverlayToolButton
                  icon={ArrowUpRight}
                  label="Open on X"
                  onClick={() => openBookmarkOnX(bookmark)}
                />
                <BookmarkOverlayToolButton
                  icon={Link2}
                  label="Copy link"
                  onClick={handleCopyLink}
                />
                {onDecision ? (
                  <BookmarkOverlayToolButton
                    icon={ArchiveX}
                    label="Discard bookmark"
                    tone="danger"
                    onClick={() =>
                      closeAndRun(() => onDecision(bookmark.id, "discard"))
                    }
                  />
                ) : null}
              </div>
            </div>

            {hasPrimarySuggestion && decision?.suggestedTags.length ? (
              <div className="mt-5 border-t border-hairline-soft pt-4">
                <BookmarkOverlaySectionLabel>Suggested tags</BookmarkOverlaySectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {decision.suggestedTags.slice(0, 5).map((tag) => (
                    <BookmarkOverlayTagPill
                      key={`${tag.name}-${tag.color}`}
                      name={tag.name}
                      color={tag.color}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <BookmarkOverlayTagsSection
              tags={bookmark.tags}
              title="Current tags"
            />
            <BookmarkOverlayCollectionsSection collections={bookmark.collectionItems} />
          </BookmarkOverlaySidebar>
        </>
      ) : null}
    </BookmarkOverlayShell>
  );
}
