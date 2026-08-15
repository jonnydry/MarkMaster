"use client";

import { memo } from "react";
import { Check, FolderInput, MoreHorizontal, Tag as TagIcon } from "lucide-react";
import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

import {
  getOrbitRowQueueStatus,
  getOrbitRowSuggestion,
  type OrbitRowQueueStatus,
} from "@/lib/orbit-row-status";
import {
  orbitDataClass,
  orbitHairlineBorder,
  orbitHoverRowClass,
  orbitLabelClass,
  orbitMetaMuted,
} from "@/lib/orbit-route-chrome";
import { OrbitActionPill } from "./orbit-quick-actions";

const EMPTY_ID_SET = new Set<string>();

interface OrbitListRowProps {
  bookmark: BookmarkWithRelations;
  selected?: boolean;
  selectionMode?: boolean;
  bulkSelected?: boolean;
  decision?: OrbitBookmarkDecision | null;
  dismissedBookmarkIds?: Set<string>;
  appliedBookmarkIds?: Set<string>;
  onSelect?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onQuickAction?: (id: string, action: string, event?: React.MouseEvent) => void;
}

export const OrbitListRow = memo(function OrbitListRow({
  bookmark,
  selected = false,
  selectionMode = false,
  bulkSelected = false,
  decision = null,
  dismissedBookmarkIds,
  appliedBookmarkIds,
  onSelect,
  onToggleSelect,
  onQuickAction,
}: OrbitListRowProps) {
  const author = bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
  const handle = bookmark.authorUsername ? `@${bookmark.authorUsername}` : "";

  const savedLabel = (() => {
    const savedAt = bookmark.bookmarkedAt;
    const at = savedAt ?? bookmark.tweetCreatedAt;
    if (!at) return "";
    const date = new Date(at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const prefix = savedAt ? "Saved" : "Posted";

    if (diffHours < 1) return `${prefix} now`;
    if (diffHours < 24) return `${prefix} ${diffHours}h ago`;
    if (diffDays < 7) return `${prefix} ${diffDays}d ago`;
    return `${prefix} ${date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  })();

  const likes = bookmark.publicMetrics?.like_count ?? 0;
  const rts = bookmark.publicMetrics?.retweet_count ?? 0;
  const engagement =
    likes + rts > 0
      ? `♥ ${likes}${rts > 0 ? ` · ↻ ${rts}` : ""}`
      : "";

  const queueStatus: OrbitRowQueueStatus = getOrbitRowQueueStatus({
    bookmarkId: bookmark.id,
    dismissedBookmarkIds: dismissedBookmarkIds ?? EMPTY_ID_SET,
    appliedBookmarkIds: appliedBookmarkIds ?? EMPTY_ID_SET,
    decision,
  });
  const suggestion = getOrbitRowSuggestion(decision);
  const showSuggestion = queueStatus === "hasSuggestion" && Boolean(suggestion);
  const confidenceDotClass =
    suggestion?.confidence === "high"
      ? "bg-emerald-500"
      : suggestion?.confidence === "medium"
        ? "bg-amber-500"
        : "bg-muted-foreground/50";

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect?.(bookmark.id);
      return;
    }
    onSelect?.(bookmark.id);
  };

  const excerpt = bookmark.tweetText?.trim() || "Untitled bookmark";
  const checkboxLabel = `${author}: ${excerpt.slice(0, 80)}`;
  const mediaItems = bookmark.media;
  const hasMedia = Boolean(mediaItems?.length);
  const tweetLink = {
    authorUsername: bookmark.authorUsername,
    tweetId: bookmark.tweetId};

  return (
    <article
      data-orbit-row-id={bookmark.id}
      className={cn(
        "group relative flex cursor-pointer items-stretch gap-3 border-b px-5 py-2.5 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_112px] transition-all",
        orbitHairlineBorder(),
        orbitHoverRowClass(),
        !selectionMode &&
          selected &&
          ("border-primary/20 bg-primary/10 dark:border-primary/10 dark:bg-[#0F0F0F]"),
        selectionMode && bulkSelected && "bg-primary/5",
        queueStatus === "dismissed" && "opacity-50",
        queueStatus === "applied" && "opacity-70"
      )}
    >
      <button
        type="button"
        onClick={handleRowClick}
        aria-label={
          selectionMode
            ? `${bulkSelected ? "Remove" : "Add"} ${checkboxLabel} ${
                bulkSelected ? "from" : "to"
              } selection`
            : `Review ${checkboxLabel}`
        }
        aria-pressed={selectionMode ? bulkSelected : undefined}
        aria-current={!selectionMode && selected ? "true" : undefined}
        className="absolute inset-0 z-0 rounded-none border border-transparent focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
      />
      {selectionMode ? (
        <div
          className="relative z-10 shrink-0 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={bulkSelected}
            onCheckedChange={() => onToggleSelect?.(bookmark.id)}
            aria-label={checkboxLabel}
          />
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none relative z-10 mt-1 w-[3px] shrink-0 self-stretch rounded-none transition-all",
          selected
            ? "bg-primary"
            : "bg-transparent group-hover:bg-primary/25",
          queueStatus === "hasSuggestion" && !selected && "bg-primary/40"
        )}
      />

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 truncate text-2xs",
            "text-muted-foreground",
            orbitMetaMuted()
          )}
        >
          <span
            className={cn(
              orbitLabelClass(),
              "shrink-0 normal-case font-medium tracking-normal",
              "text-foreground/90"
            )}
          >
            {author}
          </span>
          {handle ? (
            <>
              <span className={"text-muted-foreground/50"}>
                ·
              </span>
              <span className={cn(orbitDataClass(), "truncate normal-case")}>
                {handle}
              </span>
            </>
          ) : null}
          {savedLabel ? (
            <>
              <span className={"text-muted-foreground/50"}>
                ·
              </span>
              <span className={cn(orbitDataClass(), "shrink-0 tabular-nums")}>
                {savedLabel}
              </span>
            </>
          ) : null}
          {engagement ? (
            <>
              <span className={"text-muted-foreground/50"}>
                ·
              </span>
              <span
                className={cn(
                  orbitDataClass(),
                  "hidden shrink-0 tabular-nums sm:inline",
                  orbitMetaMuted()
                )}
              >
                {engagement}
              </span>
            </>
          ) : null}
        </div>

        <div>
          <BookmarkPostPreview
            tweetText={excerpt}
            authorUsername={bookmark.authorUsername}
            media={hasMedia ? mediaItems : null}
            tweetLink={tweetLink}
            bookmarkKey={bookmark.id}
            variant="compact"
            stopClickPropagation
            className="pointer-events-none"
            galleryClassName="pointer-events-auto"
            textClassName={cn(
              "line-clamp-4 normal-case text-[13px] font-medium leading-snug tracking-normal",
              "text-foreground",
              queueStatus === "dismissed" &&
                "line-through decoration-foreground/30"
            )}
          />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {showSuggestion && suggestion ? (
              <span
                className={cn(
                  "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border py-0.5 pl-1.5 pr-1 text-xs",
                  "border-primary/20 bg-primary/[0.06] text-foreground/90 dark:border-primary/25 dark:bg-primary/[0.08]"
                )}
                title={`Grok suggests: ${
                  suggestion.kind === "collection" ? "add to" : "tag as"
                } ${suggestion.label} · ${suggestion.confidence} confidence`}
              >
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", confidenceDotClass)}
                  aria-hidden
                />
                {suggestion.kind === "collection" ? (
                  <FolderInput className="size-3 shrink-0 text-primary/70" aria-hidden />
                ) : (
                  <TagIcon
                    className="size-3 shrink-0"
                    style={suggestion.color ? { color: suggestion.color } : undefined}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 max-w-[12rem] truncate font-medium">
                  {suggestion.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm border px-1 py-px text-2xs font-medium uppercase tracking-[0.08em]",
                    suggestion.reuseExisting
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300"
                      : "border-primary/25 bg-primary/10 text-primary/80"
                  )}
                >
                  {suggestion.reuseExisting ? "Lib" : "New"}
                </span>
              </span>
            ) : null}
            {queueStatus === "applied" ? (
              <span
                className="inline-flex items-center gap-0.5 text-2xs text-emerald-400/90"
                aria-label="Suggestion applied"
              >
                <Check className="size-3" aria-hidden />
                Applied
              </span>
            ) : queueStatus === "dismissed" ? (
              <span className={cn("text-2xs", orbitMetaMuted())}>Skipped</span>
            ) : null}
          </div>

          <div
            className={cn(
              "pointer-events-auto flex shrink-0 items-center gap-1 transition-opacity",
              selected || selectionMode
                ? "opacity-100"
                : "opacity-100 max-lg:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
            )}
          >
            <OrbitActionPill
              bookmarkId={bookmark.id}
              suggestionDismissed={queueStatus === "dismissed"}
              hasSuggestion={showSuggestion}
              onAction={onQuickAction}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAction?.(bookmark.id, "menu", e);
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-sm border border-transparent transition-colors",
                "text-muted-foreground hover:border-primary/20 hover:bg-accent-soft hover:text-primary focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
                orbitMetaMuted()
              )}
              title="More actions"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
});
