"use client";

import type { ElementType, ReactNode } from "react";
import Image from "next/image";
import {
  ArchiveX,
  ArrowUpRight,
  FolderInput,
  Link2,
  RotateCcw,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitLogoMark } from "@/components/brands/orbit-logo-mark";
import { XLogoMark } from "@/components/brands/x-logo-mark";
import {
  X_POST_METRIC_ICON_CLASS,
  XPostLikeIcon,
  XPostReplyIcon,
  XPostRepostIcon,
} from "@/components/brands/x-post-metric-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatPostDate(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function OrbitOverlayToolButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: ElementType;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
}) {
  return (
    <Button
      type="button"
      variant={tone === "danger" ? "destructive" : tone === "primary" ? "default" : "secondary"}
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 justify-start gap-2 rounded-sm text-xs",
        tone === "neutral" &&
          "border-hairline-soft bg-surface-1/55 text-foreground hover:border-primary/30 hover:bg-accent-soft",
        tone === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

function MetricCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-sm border border-hairline-soft bg-surface-1/55 p-2">
      {icon}
      <div className="mt-1 text-sm font-semibold text-foreground">
        {formatCount(value)}
      </div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
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
        "inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
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

function TagPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-hairline-soft bg-surface-1/55 px-2 py-1 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-background/35 supports-backdrop-filter:backdrop-blur-xl dark:bg-black/45"
        className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[1120px] overflow-hidden border border-hairline-strong bg-surface-1/78 p-0 shadow-[0_30px_120px_-50px_rgba(0,0,0,0.95)] supports-[backdrop-filter]:backdrop-blur-2xl sm:max-w-[1120px]"
      >
        <DialogTitle className="sr-only">
          {bookmark ? `Orbit review for ${bookmark.authorDisplayName}` : "Orbit review"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Review a bookmark and apply Orbit suggestions.
        </DialogDescription>

        {bookmark ? (
          <div
            data-orbit-expanded-overlay={bookmark.id}
            className="grid max-h-[calc(100dvh-1.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-start gap-3">
                {bookmark.authorProfileImage ? (
                  <Image
                    src={bookmark.authorProfileImage}
                    alt={`${bookmark.authorDisplayName} avatar`}
                    width={44}
                    height={44}
                    className="h-11 w-11 shrink-0 rounded-full"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                    {(bookmark.authorDisplayName || bookmark.authorUsername || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-base font-semibold text-foreground">
                      {bookmark.authorDisplayName || bookmark.authorUsername}
                    </span>
                    {bookmark.authorUsername ? (
                      <span className="text-sm text-muted-foreground">
                        @{bookmark.authorUsername}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatPostDate(bookmark.tweetCreatedAt)}
                    </span>
                    <XLogoMark
                      className="h-3.5 w-3.5 text-muted-foreground/60"
                      title="Post from X"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-primary/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
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
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close Orbit review"
                  className="rounded-sm border border-hairline-soft bg-surface-2/60 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <BookmarkPostPreview
                tweetText={bookmark.tweetText}
                authorUsername={bookmark.authorUsername}
                media={bookmark.media}
                tweetLink={{
                  authorUsername: bookmark.authorUsername,
                  tweetId: bookmark.tweetId,
                }}
                bookmarkKey={bookmark.id}
                variant="feed"
                priorityMedia
                stopClickPropagation
                className="mt-5"
                textClassName="whitespace-pre-wrap break-words text-[17px] leading-8 text-foreground"
                galleryClassName="!mt-4 border-hairline-strong bg-black/10"
              />

              {bookmark.quotedTweet ? (
                <div className="mt-4 rounded-sm border border-hairline-soft bg-surface-2/45 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-sm">
                    <span className="font-medium text-foreground">
                      {bookmark.quotedTweet.author?.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{bookmark.quotedTweet.author?.username}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {bookmark.quotedTweet.text}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="min-h-0 overflow-y-auto border-t border-hairline-soft bg-surface-2/48 px-4 py-4 supports-[backdrop-filter]:backdrop-blur-xl lg:border-l lg:border-t-0">
              {bookmark.publicMetrics ? (
                <div className="grid grid-cols-3 gap-2">
                  <MetricCard
                    icon={<XPostLikeIcon className={X_POST_METRIC_ICON_CLASS} />}
                    value={bookmark.publicMetrics.like_count}
                    label="Likes"
                  />
                  <MetricCard
                    icon={<XPostRepostIcon className={X_POST_METRIC_ICON_CLASS} />}
                    value={bookmark.publicMetrics.retweet_count}
                    label="Reposts"
                  />
                  <MetricCard
                    icon={<XPostReplyIcon className={X_POST_METRIC_ICON_CLASS} />}
                    value={bookmark.publicMetrics.reply_count}
                    label="Replies"
                  />
                </div>
              ) : null}

              {hasPrimarySuggestion ? (
                <div className="mt-5 rounded-sm border border-primary/20 bg-primary/[0.07] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/80">
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
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Orbit actions
                </div>
                <div className="grid gap-2">
                  {hasPrimarySuggestion && onDecision ? (
                    <OrbitOverlayToolButton
                      icon={Sparkles}
                      label={applyLabel}
                      tone="primary"
                      onClick={() =>
                        closeAndRun(() => onDecision(bookmark.id, "keep-tag"))
                      }
                    />
                  ) : null}
                  {suggestionDismissed && onDecision ? (
                    <OrbitOverlayToolButton
                      icon={RotateCcw}
                      label="Restore suggestion"
                      onClick={() =>
                        closeAndRun(() => onDecision(bookmark.id, "dismiss"))
                      }
                    />
                  ) : null}
                  {onAddTag ? (
                    <OrbitOverlayToolButton
                      icon={Tags}
                      label={bookmark.tags.length > 0 ? "Edit tags" : "Add tags"}
                      onClick={() => closeAndRun(() => onAddTag(bookmark.id))}
                    />
                  ) : null}
                  {onAddToCollection ? (
                    <OrbitOverlayToolButton
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
                    <OrbitOverlayToolButton
                      icon={OrbitLogoMark}
                      label="Open review pass"
                      onClick={() =>
                        closeAndRun(() => onFullReview(bookmark.id))
                      }
                    />
                  ) : null}
                  <OrbitOverlayToolButton
                    icon={ArrowUpRight}
                    label="Open on X"
                    onClick={() => openBookmarkOnX(bookmark)}
                  />
                  <OrbitOverlayToolButton
                    icon={Link2}
                    label="Copy link"
                    onClick={handleCopyLink}
                  />
                  {onDecision ? (
                    <OrbitOverlayToolButton
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
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Suggested tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {decision.suggestedTags.slice(0, 5).map((tag) => (
                      <TagPill
                        key={`${tag.name}-${tag.color}`}
                        name={tag.name}
                        color={tag.color}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 border-t border-hairline-soft pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Current tags
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bookmark.tags.length > 0 ? (
                    bookmark.tags.map(({ tag }) => (
                      <TagPill key={tag.id} name={tag.name} color={tag.color} />
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground/70">
                      No tags yet
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-hairline-soft pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Collections
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bookmark.collectionItems.length > 0 ? (
                    bookmark.collectionItems.map(({ collection }) => (
                      <span
                        key={collection.id}
                        className="rounded-sm border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {collection.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground/70">
                      Not in a collection
                    </span>
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
