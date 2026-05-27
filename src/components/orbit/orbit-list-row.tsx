"use client";

import { memo } from "react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

import { useOrbitalTheme } from "@/components/providers";
import {
  formatOrbitRowStatusChip,
  getOrbitRowQueueStatus,
  type OrbitRowQueueStatus,
} from "@/lib/orbit-row-status";
import {
  orbitDataClass,
  orbitHairlineBorder,
  orbitHoverRowClass,
  orbitLabelClass,
} from "@/lib/orbit-route-chrome";
import { OrbitActionPill } from "./orbit-quick-actions";

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
  const { isOrbital } = useOrbitalTheme();
  const author = bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
  const handle = bookmark.authorUsername ? `@${bookmark.authorUsername}` : "";

  const timeAgo = (() => {
    const at = bookmark.bookmarkedAt ?? bookmark.tweetCreatedAt;
    if (!at) return "";
    const date = new Date(at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "now";
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  })();

  const likes = bookmark.publicMetrics?.like_count ?? 0;
  const rts = bookmark.publicMetrics?.retweet_count ?? 0;
  const engagement =
    likes + rts > 0
      ? `♥ ${likes}${rts > 0 ? ` · ↻ ${rts}` : ""}`
      : "";

  const queueStatus: OrbitRowQueueStatus = getOrbitRowQueueStatus({
    bookmarkId: bookmark.id,
    dismissedBookmarkIds: dismissedBookmarkIds ?? new Set(),
    appliedBookmarkIds: appliedBookmarkIds ?? new Set(),
    decision,
  });
  const statusChip = formatOrbitRowStatusChip(decision);

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect?.(bookmark.id);
      return;
    }
    onSelect?.(bookmark.id);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick();
    }
  };

  const excerpt = bookmark.tweetText?.trim() || "Untitled bookmark";
  const checkboxLabel = `${author}: ${excerpt.slice(0, 80)}`;

  return (
    <div
      data-orbit-row-id={bookmark.id}
      role="button"
      tabIndex={selectionMode ? -1 : 0}
      aria-pressed={selected}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      className={cn(
        "group flex cursor-pointer items-stretch gap-3 border-b px-5 py-2.5 text-sm transition-all",
        orbitHairlineBorder(isOrbital),
        orbitHoverRowClass(isOrbital),
        !selectionMode &&
          selected &&
          (isOrbital
            ? "border-primary/10 bg-[#0F0F0F] shadow-[inset_3px_0_0_0_#5CE1C7]"
            : "border-primary/10 bg-[#0F0F0F] shadow-[inset_3px_0_0_0_#38bdf8]"),
        selectionMode && bulkSelected && "bg-primary/5",
        queueStatus === "dismissed" && "opacity-50",
        queueStatus === "applied" && "opacity-70"
      )}
    >
      {selectionMode ? (
        <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={bulkSelected}
            onCheckedChange={() => onToggleSelect?.(bookmark.id)}
            aria-label={checkboxLabel}
          />
        </div>
      ) : null}

      <div
        className={cn(
          "mt-1 w-[3px] shrink-0 self-stretch rounded-full transition-all",
          selected
            ? isOrbital
              ? "bg-primary"
              : "bg-sky-400"
            : "bg-transparent group-hover:bg-primary/25",
          queueStatus === "hasSuggestion" && !selected && "bg-primary/40"
        )}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 truncate text-[10px]",
            isOrbital ? "text-primary/65" : "text-white/65"
          )}
        >
          <span
            className={cn(
              orbitLabelClass(isOrbital),
              "shrink-0 normal-case font-medium tracking-normal",
              isOrbital ? "text-foreground/90" : "text-white/90"
            )}
          >
            {author}
          </span>
          {handle ? (
            <>
              <span className={isOrbital ? "text-primary/25" : "text-white/25"}>
                ·
              </span>
              <span className={cn(orbitDataClass(isOrbital), "truncate normal-case")}>
                {handle}
              </span>
            </>
          ) : null}
          {timeAgo ? (
            <>
              <span className={isOrbital ? "text-primary/25" : "text-white/25"}>
                ·
              </span>
              <span className={cn(orbitDataClass(isOrbital), "shrink-0 tabular-nums")}>
                {timeAgo}
              </span>
            </>
          ) : null}
          {engagement ? (
            <>
              <span className={isOrbital ? "text-primary/25" : "text-white/25"}>
                ·
              </span>
              <span
                className={cn(
                  orbitDataClass(isOrbital),
                  "hidden shrink-0 tabular-nums sm:inline",
                  isOrbital ? "text-primary/50" : "text-white/50"
                )}
              >
                {engagement}
              </span>
            </>
          ) : null}
        </div>

        <p
          className={cn(
            "line-clamp-4 normal-case text-[13px] font-medium leading-snug tracking-normal",
            isOrbital ? "text-foreground" : "text-white",
            queueStatus === "dismissed" && "line-through decoration-white/30"
          )}
        >
          {excerpt}
        </p>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {statusChip ? (
              <span
                className={cn(
                  "inline-flex rounded-sm border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                  isOrbital
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-sky-400/25 bg-sky-400/10 text-sky-200"
                )}
              >
                {statusChip}
              </span>
            ) : null}
            {queueStatus === "applied" ? (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400/90"
                aria-label="Suggestion applied"
              >
                <Check className="size-3" aria-hidden />
                Applied
              </span>
            ) : queueStatus === "dismissed" ? (
              <span className="text-[10px] text-white/40">Skipped</span>
            ) : null}
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center gap-1 transition-opacity",
              selected || selectionMode
                ? "opacity-100"
                : "opacity-100 max-lg:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
            )}
          >
            <OrbitActionPill
              bookmarkId={bookmark.id}
              suggestionDismissed={queueStatus === "dismissed"}
              onAction={onQuickAction}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAction?.(bookmark.id, "menu", e);
              }}
              className={cn(
                "rounded p-1",
                isOrbital
                  ? "text-primary/40 hover:text-primary/70"
                  : "text-white/40 hover:text-sky-200"
              )}
              title="More actions"
              aria-label="More actions"
            >
              ⋯
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
