"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

import { orbital } from "@/components/orbital";
import { OrbitActionPill } from "./orbit-quick-actions";

/**
 * OrbitListRow
 *
 * High-density, scannable list row for the new clean Orbit experience.
 * Designed to match Paper artboard 6U-0 ("Clean List View (Monospace Native)").
 *
 * Features:
 * - Perfect vertical meta lane alignment (fixed-width slots)
 * - Subtle cyan left accent + glass lift on selected state
 * - 3-tier monospace-native typography
 * - Extremely restrained, calm, production-quality
 */

interface OrbitListRowProps {
  bookmark: BookmarkWithRelations;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onQuickAction?: (id: string, action: string, event?: React.MouseEvent) => void;
}

export const OrbitListRow = memo(function OrbitListRow({
  bookmark,
  selected = false,
  onSelect,
  onQuickAction,
}: OrbitListRowProps) {
  const author = bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
  const handle = bookmark.authorUsername ? `@${bookmark.authorUsername}` : "";

  // Elegant, lightweight relative time
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

  // Real engagement (likes + RTs for a rich but scannable signal)
  const likes = bookmark.publicMetrics?.like_count ?? 0;
  const rts = bookmark.publicMetrics?.retweet_count ?? 0;
  const engagement = likes + rts > 0 ? `+${likes + rts}` : "";

  return (
    <div
      onClick={() => onSelect?.(bookmark.id)}
      className={cn(
        "group flex cursor-pointer items-center gap-3 border-b border-hairline-soft px-5 py-[9px] text-sm transition-all",
        "hover:bg-white/[0.012]",
        selected &&
          "border-primary/10 bg-[#0F0F0F] shadow-[inset_3px_0_0_0_#5CE1C7]"
      )}
    >
      {/* Left orbital accent bar */}
      <div
        className={cn(
          "w-[3px] self-stretch rounded-full transition-all",
          selected ? "bg-primary" : "bg-transparent group-hover:bg-primary/25"
        )}
      />

      {/* Main content - tight, elegant rhythm */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Title - IBM Plex Mono (Tier 2) */}
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-white tracking-[-0.005em]">
          {bookmark.tweetText?.slice(0, 118) || "Untitled bookmark"}
        </div>

        {/* Meta lanes - fixed for perfect vertical alignment */}
        <div className="flex shrink-0 items-center gap-4 text-[10px] text-primary/65">
          <div className="w-[88px] truncate font-medium tabular-nums">
            {author}
          </div>

          <div className="flex w-[74px] items-center gap-1 text-primary/45">
            <span className="truncate">{handle}</span>
            <span className="text-primary/20">•</span>
            <span className="tabular-nums">{timeAgo}</span>
          </div>

          <div className={cn(orbital.data, "w-[42px] text-right text-primary/55 tabular-nums")}>
            {engagement}
          </div>
        </div>
      </div>

      {/* Light action area: pill + subtle more menu trigger (elegant, not heavy) */}
      <div className={cn(
        "flex shrink-0 items-center gap-1 transition-opacity",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        <OrbitActionPill
          bookmarkId={bookmark.id}
          onAction={onQuickAction}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Pass the event so parent can position the floating menu elegantly
            onQuickAction?.(bookmark.id, "menu", e);
          }}
          className="rounded p-1 text-primary/40 hover:text-primary/70"
          title="More actions"
        >
          ⋯
        </button>
      </div>
    </div>
  );
});
