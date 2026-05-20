"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

import {
  orbital,
  OrbitalCard,
  OrbitalBadge,
  OrbitalActionPill,
} from "@/components/orbital";

/**
 * OrbitSlideInPanel
 *
 * Right-edge slide-in review panel for the new clean-list Orbit experience.
 * Matches Paper artboard 7X-0 exactly in spirit and structure.
 *
 * This is currently a high-fidelity skeleton. Full wiring (Grok decisions,
 * tag/collection handlers, apply logic) will be added in the implementation phase.
 */

interface OrbitSlideInPanelProps {
  bookmark: BookmarkWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  decision?: OrbitBookmarkDecision | null;
  onFullReview?: (bookmarkId: string) => void;
  onDecision?: (bookmarkId: string, kind: string) => void;
}

export function OrbitSlideInPanel({
  bookmark,
  isOpen,
  onClose,
  decision,
  onFullReview,
  onDecision,
}: OrbitSlideInPanelProps) {
  if (!isOpen || !bookmark) return null;

  const author = bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
  const handle = bookmark.authorUsername ? `@${bookmark.authorUsername}` : "";

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-40 w-[460px] border-l border-primary/30 bg-[#0A0A0A]",
        "animate-orbit-slide-in-right orbital-slide-in",
        orbital.slideIn
      )}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-primary/20 px-5 py-4">
        <div className={cn(orbital.label, "text-primary/80 tracking-[0.18em]")}>
          REVIEW
        </div>
        <button
          onClick={onClose}
          className="rounded-sm p-1 text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label="Close review panel"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex h-[calc(100%-56px)] flex-col overflow-y-auto px-5 py-5 text-sm">
        {/* Post Context */}
        <div className="mb-5">
          <div className="line-clamp-2 text-[15px] font-medium leading-tight text-white">
            {bookmark.tweetText?.slice(0, 180) || "Bookmark content"}
          </div>
          <div className="mt-1.5 text-[11px] text-primary/60">
            {author} {handle && <span className="text-primary/40">{handle}</span>}
          </div>
        </div>

        {/* Grok Suggestion - now shows the actual primary move when available */}
        <OrbitalCard className="mb-6 p-4">
          <div className={cn(orbital.sectionLabel, "mb-2")}>GROK SUGGESTION</div>

          {decision?.primary ? (
            <div className="text-[13px] leading-snug text-white/90">
              {decision.primary.kind === "collection" 
                ? `Add to ${decision.primary.label}` 
                : `Tag as ${decision.primary.label}`}
            </div>
          ) : decision?.reasoning ? (
            <p className="text-[13px] leading-snug text-white/90">{decision.reasoning}</p>
          ) : (
            <p className="text-[13px] leading-snug text-white/90">
              Strong match for your existing collections.
            </p>
          )}

          {decision?.confidence && (
            <div className="mt-2">
              <span className={cn(orbital.badge(decision.confidence === "high" ? "cyan" : "bronze"), "text-[10px]")}>
                {decision.confidence.toUpperCase()}
              </span>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "keep-tag")}
              className="flex-1 rounded-sm bg-primary py-1.5 text-xs font-medium text-[#0A0A0A] hover:bg-primary/90"
            >
              ACCEPT
            </button>
            <button
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "dismiss")}
              className="flex-1 rounded-sm border border-primary/30 py-1.5 text-xs text-primary/80 hover:bg-primary/5"
            >
              KEEP IN ORBIT
            </button>
          </div>
        </OrbitalCard>

        {/* Tags — real suggestions when available */}
        <div className="mb-5">
          <div className={orbital.sectionLabel}>TAGS</div>
          <div className="flex flex-wrap gap-1.5">
            {decision?.suggestedTags?.length ? (
              decision.suggestedTags.slice(0, 4).map((tag, i) => (
                <span key={i} className={orbital.pill}>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-primary/45">No tag suggestions yet</span>
            )}
            <button className="text-[11px] text-primary/50 hover:text-primary">+ add</button>
          </div>
        </div>

        {/* Collections — show primary suggestion if present */}
        <div className="mb-5">
          <div className={orbital.sectionLabel}>COLLECTIONS</div>
          <div className="flex flex-wrap gap-1.5">
            {decision?.primary?.kind === "collection" ? (
              <span className={cn(orbital.pill, "border-bronze/30 bg-bronze/10 text-bronze")}>
                {decision.primary.label}
              </span>
            ) : (
              <span className="text-[11px] text-primary/45">No collection suggestion</span>
            )}
            <button className="border border-dashed border-primary/30 px-2 py-0.5 text-[11px] text-primary/50 hover:border-primary/50">
              + add
            </button>
          </div>
        </div>

        {/* Decisions */}
        <div className="mt-auto pt-4">
          <div className={orbital.sectionLabel}>DECISIONS</div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "keep-tag")}
              className="rounded-sm bg-primary py-2 text-sm font-medium text-[#0A0A0A] hover:bg-primary/90 active:bg-primary/80"
            >
              KEEP + TAG
            </button>

            <button
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "archive")}
              className="rounded-sm border border-bronze/40 bg-bronze/5 py-2 text-sm text-bronze hover:bg-bronze/10"
            >
              ARCHIVE
            </button>

            <button
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "discard")}
              className="rounded-sm border border-primary/20 py-2 text-sm text-primary/70 hover:bg-white/5"
            >
              DISCARD
            </button>
          </div>

          <button
            onClick={() => bookmark.id && onFullReview?.(bookmark.id)}
            className="mt-4 w-full text-center text-[10px] uppercase tracking-[0.14em] text-primary/60 hover:text-primary"
          >
            Full review →
          </button>
        </div>
      </div>
    </div>
  );
}
