"use client";

import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";
import { HighlightCard } from "@/components/highlight-card";
import {
  HighlightScrollSlide,
  HighlightScrollStrip,
} from "@/components/highlight-scroll-strip";
import type { BookmarkWithRelations } from "@/types";

interface PerformanceHighlightsProps {
  bookmarks: BookmarkWithRelations[];
  total?: number;
  title?: string;
  subtitle?: string;
  activeBookmarkId?: string | null;
  onSelect?: (id: string) => void;
  onFocusForTriage?: (id: string) => void;
  onOrbitReview?: (id: string) => void;
  className?: string;
  isRawMode?: boolean;
  /** Optional per-item labels (e.g. { [bookmarkId]: "Resurfaced" }) for the Digest */
  itemLabels?: Record<string, string>;
  layout?: "grid" | "strip";
  /** Max items to render (default 4) */
  maxItems?: number;
}

export function PerformanceHighlights({
  bookmarks,
  total,
  title = "Highlights",
  subtitle,
  activeBookmarkId,
  onSelect,
  onFocusForTriage,
  onOrbitReview,
  className,
  isRawMode = false,
  itemLabels = {},
  layout = "grid",
  maxItems = 4,
}: PerformanceHighlightsProps) {
  const t = useTypography();
  const highlightBookmarks = bookmarks.slice(0, maxItems);
  if (highlightBookmarks.length === 0) return null;

  const displaySubtitle =
    subtitle ??
    (typeof total === "number"
      ? `${total.toLocaleString()} total`
      : `${highlightBookmarks.length.toLocaleString()} in view`);

  const cardProps = {
    isRawMode,
    onSelect,
    onFocusForTriage,
    onOrbitReview,
  };

  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[960px] px-4 pb-2 pt-2 sm:px-5",
        className
      )}
    >
      {(title || displaySubtitle) && (
        <div className="mb-2 flex items-center gap-2">
          {title ? (
            <h2 className={cn(t.sectionLabel, "mb-0 text-muted-foreground")}>
              {title}
            </h2>
          ) : null}
          <span className={cn(t.label, "text-muted-foreground/70")}>{displaySubtitle}</span>
        </div>
      )}

      {layout === "strip" ? (
        <HighlightScrollStrip
          ariaLabel={title || "Highlights"}
          itemCount={highlightBookmarks.length}
        >
          {highlightBookmarks.map((bookmark, index) => (
            <HighlightScrollSlide key={bookmark.id} index={index} desktopTwoUp>
              <HighlightCard
                bookmark={bookmark}
                index={index}
                active={activeBookmarkId === bookmark.id}
                itemLabel={itemLabels[bookmark.id]}
                {...cardProps}
              />
            </HighlightScrollSlide>
          ))}
        </HighlightScrollStrip>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {highlightBookmarks.map((bookmark, index) => (
            <HighlightCard
              key={bookmark.id}
              bookmark={bookmark}
              index={index}
              active={activeBookmarkId === bookmark.id}
              itemLabel={itemLabels[bookmark.id]}
              {...cardProps}
            />
          ))}
        </div>
      )}
    </section>
  );
}
