"use client";

import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

import { useOrbitalTheme } from "@/components/providers";
import { orbitDataClass, orbitHairlineBorder, orbitLabelClass } from "@/lib/orbit-route-chrome";
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
  selectionMode?: boolean;
  bulkSelected?: boolean;
  onSelect?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onQuickAction?: (id: string, action: string, event?: React.MouseEvent) => void;
}

export const OrbitListRow = memo(function OrbitListRow({
  bookmark,
  selected = false,
  selectionMode = false,
  bulkSelected = false,
  onSelect,
  onToggleSelect,
  onQuickAction,
}: OrbitListRowProps) {
  const { isOrbital } = useOrbitalTheme();
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

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect?.(bookmark.id);
      return;
    }
    onSelect?.(bookmark.id);
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "group flex cursor-pointer items-center gap-3 border-b px-5 py-[9px] text-sm transition-all",
        orbitHairlineBorder(isOrbital),
        "hover:bg-white/[0.012]",
        !selectionMode &&
          selected &&
          (isOrbital
            ? "border-primary/10 bg-[#0F0F0F] shadow-[inset_3px_0_0_0_#5CE1C7]"
            : "border-primary/10 bg-[#0F0F0F] shadow-[inset_3px_0_0_0_#38bdf8]"),
        selectionMode && bulkSelected && "bg-primary/5"
      )}
    >
      {selectionMode ? (
        <div
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={bulkSelected}
            onCheckedChange={() => onToggleSelect?.(bookmark.id)}
            aria-label={`Select bookmark`}
          />
        </div>
      ) : null}
      {/* Left orbital accent bar */}
      <div
        className={cn(
          "w-[3px] self-stretch rounded-full transition-all",
          selected
            ? isOrbital
              ? "bg-primary"
              : "bg-sky-400"
            : "bg-transparent group-hover:bg-primary/25"
        )}
      />

      {/* Main content - tight, elegant rhythm */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Title — tier 2 (IBM Plex), normal case for tweet excerpt */}
        <div
          className={cn(
            orbitLabelClass(isOrbital),
            "min-w-0 flex-1 truncate normal-case text-[13px] font-medium leading-snug tracking-normal",
            isOrbital ? "text-foreground" : "text-white"
          )}
        >
          {bookmark.tweetText?.slice(0, 118) || "Untitled bookmark"}
        </div>

        {/* Meta lanes — tier 2 author, tier 3 handle/time/engagement */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-4 text-[10px]",
            isOrbital ? "text-primary/65" : "text-white/65"
          )}
        >
          <div
            className={cn(
              orbitLabelClass(isOrbital),
              "w-[88px] truncate normal-case font-medium tracking-normal"
            )}
          >
            {author}
          </div>

          <div
            className={cn(
              orbitDataClass(isOrbital),
              "flex w-[74px] items-center gap-1 normal-case",
              isOrbital ? "text-primary/45" : "text-white/45"
            )}
          >
            <span className="truncate">{handle}</span>
            <span className={isOrbital ? "text-primary/20" : "text-white/20"}>
              •
            </span>
            <span>{timeAgo}</span>
          </div>

          <div
            className={cn(
              orbitDataClass(isOrbital),
              "w-[42px] text-right tabular-nums",
              isOrbital ? "text-primary/55" : "text-white/55"
            )}
          >
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
          className={cn(
            "rounded p-1",
            isOrbital
              ? "text-primary/40 hover:text-primary/70"
              : "text-white/40 hover:text-sky-200"
          )}
          title="More actions"
        >
          ⋯
        </button>
      </div>
    </div>
  );
});
