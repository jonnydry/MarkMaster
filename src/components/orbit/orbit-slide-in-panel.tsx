"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations, OrbitBookmarkDecision } from "@/types";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import { orbital, OrbitalCard } from "@/components/orbital";
import { useOrbitalTheme } from "@/components/providers";
import { orbitLabelClass } from "@/lib/orbit-route-chrome";

const SLIDE_IN_LONG_POST_THRESHOLD = 600;

interface OrbitSlideInPanelProps {
  bookmark: BookmarkWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  decision?: OrbitBookmarkDecision | null;
  onFullReview?: (bookmarkId: string) => void;
  onDecision?: (bookmarkId: string, kind: string) => void;
  onAddTag?: (bookmarkId: string) => void;
  onAddToCollection?: (bookmarkId: string) => void;
  /** Show batch “Full review” entry only when a scan plan is active. */
  showFullReview?: boolean;
  /** Grok suggestion skipped for this bookmark in the current pass. */
  suggestionDismissed?: boolean;
}

function OrbitSlideInPostBody({
  text,
  isOrbital,
}: {
  text: string;
  isOrbital: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > SLIDE_IN_LONG_POST_THRESHOLD;

  return (
    <div className="mb-5">
      <p
        className={cn(
          "normal-case text-[15px] font-medium leading-relaxed tracking-normal whitespace-pre-wrap break-words",
          isOrbital ? "text-foreground" : "text-foreground dark:text-white",
          isLong && !expanded && "line-clamp-12"
        )}
      >
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "mt-2 text-[11px] font-medium",
            isOrbital ? "text-primary hover:text-primary/80" : "text-sky-300 hover:text-sky-200"
          )}
        >
          {expanded ? "Show less" : "Show full post"}
        </button>
      ) : null}
    </div>
  );
}

export function OrbitSlideInPanel({
  bookmark,
  isOpen,
  onClose,
  decision,
  onFullReview,
  onDecision,
  onAddTag,
  onAddToCollection,
  showFullReview = false,
  suggestionDismissed = false,
}: OrbitSlideInPanelProps) {
  const { isOrbital } = useOrbitalTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !bookmark) return null;

  const author = bookmark.authorDisplayName || bookmark.authorUsername || "Unknown";
  const handle = bookmark.authorUsername ? `@${bookmark.authorUsername}` : "";
  const postText = bookmark.tweetText?.trim() || "Bookmark content";
  const tweetLink = {
    authorUsername: bookmark.authorUsername,
    tweetId: bookmark.tweetId,
  };
  const hasPrimarySuggestion = Boolean(decision?.primary);
  const applyLabel =
    decision?.primary?.kind === "collection"
      ? `Move to ${decision.primary.label}`
      : decision?.primary?.kind === "tag"
        ? `Apply tag · ${decision.primary.label}`
        : "Apply suggestion";

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-black/40 sm:bg-black/30"
        aria-label="Close review panel"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="orbit-slide-in-title"
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-full max-w-full sm:w-[460px] sm:max-w-[460px]",
          "animate-orbit-slide-in-right orbital-slide-in",
          isOrbital
            ? cn("border-l border-primary/30 bg-background", orbital.slideIn)
            : "border-l border-hairline-soft bg-background text-foreground dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white"
        )}
      >
        <div className="flex items-center justify-between border-b border-primary/20 px-5 py-4">
          <div
            id="orbit-slide-in-title"
            className={cn(
              orbitLabelClass(isOrbital),
              "tracking-[0.18em]",
              isOrbital ? "text-primary/80" : "text-foreground/80 dark:text-white/80"
            )}
          >
            Quick review
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="Close review panel"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex h-[calc(100%-56px)] flex-col overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm">
          <OrbitSlideInPostBody
            key={bookmark.id}
            text={postText}
            isOrbital={isOrbital}
          />
          <BookmarkPostPreview
            mediaOnly
            tweetText=""
            authorUsername={bookmark.authorUsername}
            media={bookmark.media}
            tweetLink={tweetLink}
            bookmarkKey={bookmark.id}
            variant="inline"
            galleryClassName="!mt-0 mb-4"
            stopClickPropagation
          />
          <div className={cn(orbital.data, "-mt-3 mb-5 normal-case text-[11px] text-primary/60")}>
            {author} {handle && <span className="text-primary/40">{handle}</span>}
          </div>

          <OrbitalCard
            className={cn(
              "mb-6 p-4",
              !isOrbital && "border border-hairline-soft bg-surface-2/70"
            )}
          >
            <div className={cn(orbital.sectionLabel, "mb-2")}>Grok suggestion</div>

            {decision?.primary ? (
              <div
                className={cn(
                  orbital.data,
                  "normal-case text-[13px] leading-snug text-foreground/90"
                )}
              >
                {decision.primary.kind === "collection"
                  ? `Add to ${decision.primary.label}`
                  : `Tag as ${decision.primary.label}`}
              </div>
            ) : decision?.reasoning ? (
              <p
                className={cn(
                  orbital.data,
                  "normal-case text-[13px] leading-snug text-foreground/90"
                )}
              >
                {decision.reasoning}
              </p>
            ) : (
              <p
                className={cn(
                  orbital.data,
                  "normal-case text-[13px] leading-snug text-foreground/90"
                )}
              >
                Run a scan to see Grok suggestions for this bookmark.
              </p>
            )}

            {decision?.confidence ? (
              <div className="mt-2">
                <span
                  className={cn(
                    orbital.badge(decision.confidence === "high" ? "cyan" : "bronze"),
                    "text-[10px]"
                  )}
                >
                  {decision.confidence}
                </span>
              </div>
            ) : null}
          </OrbitalCard>

          <div className="mb-5">
            <div className={orbital.sectionLabel}>Tags</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {decision?.suggestedTags?.length ? (
                decision.suggestedTags.slice(0, 4).map((tag, i) => (
                  <span key={i} className={orbital.pill}>
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-primary/45">No tag suggestions yet</span>
              )}
              <button
                type="button"
                onClick={() => bookmark.id && onAddTag?.(bookmark.id)}
                className="text-[11px] text-primary/50 hover:text-primary"
              >
                + add tag
              </button>
            </div>
          </div>

          <div className="mb-5">
            <div className={orbital.sectionLabel}>Collections</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {decision?.primary?.kind === "collection" ? (
                <span
                  className={cn(
                    orbital.pill,
                    "border-bronze/30 bg-bronze/10 text-bronze"
                  )}
                >
                  {decision.primary.label}
                </span>
              ) : (
                <span className="text-[11px] text-primary/45">
                  No collection suggestion
                </span>
              )}
              <button
                type="button"
                onClick={() => bookmark.id && onAddToCollection?.(bookmark.id)}
                className="border border-dashed border-primary/30 px-2 py-0.5 text-[11px] text-primary/50 hover:border-primary/50"
              >
                + add to collection
              </button>
            </div>
          </div>

          <div className="mt-auto space-y-2 border-t border-primary/15 pt-4">
            {hasPrimarySuggestion ? (
              <button
                type="button"
                onClick={() => bookmark.id && onDecision?.(bookmark.id, "keep-tag")}
                className="w-full rounded-sm bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {applyLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "dismiss")}
              className={cn(
                "w-full rounded-sm border py-2.5 text-sm transition-colors",
                suggestionDismissed
                  ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20"
                  : hasPrimarySuggestion
                    ? "border-primary/30 text-primary/80 hover:bg-primary/5"
                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              {suggestionDismissed ? "Restore suggestion" : "Skip suggestion"}
            </button>
            <button
              type="button"
              onClick={() => bookmark.id && onDecision?.(bookmark.id, "discard")}
              className="w-full rounded-sm border border-primary/20 py-2 text-sm text-primary/70 hover:bg-accent-soft"
            >
              Discard bookmark
            </button>

            {showFullReview && onFullReview ? (
              <button
                type="button"
                onClick={() => onFullReview(bookmark.id)}
                className={cn(
                  orbital.label,
                  "mt-2 w-full text-center text-primary/60 hover:text-primary"
                )}
              >
                Open in review pass →
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
