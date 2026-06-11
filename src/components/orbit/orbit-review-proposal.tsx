"use client";

import { FolderInput, Tag as TagIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  OrbitBookmarkSuggestion,
  OrbitCollectionSuggestion,
  OrbitTagSuggestion,
} from "@/types";

function ReuseBadge({ reuseExisting }: { reuseExisting: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-1 py-px text-[8px] font-medium uppercase tracking-[0.08em]",
        reuseExisting
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300"
          : "border-primary/25 bg-primary/10 text-primary/80"
      )}
    >
      {reuseExisting ? "Lib" : "New"}
    </span>
  );
}

function TagChip({
  tag,
  muted = false,
  compact = false,
}: {
  tag: OrbitTagSuggestion | { name: string; color?: string; reuseExisting?: boolean };
  muted?: boolean;
  compact?: boolean;
}) {
  const color = "color" in tag && tag.color ? tag.color : "#94a3b8";
  const reuseExisting = "reuseExisting" in tag ? tag.reuseExisting : undefined;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border py-0.5 pl-1.5 pr-1 text-[11px]",
        muted
          ? "border-hairline-soft/60 bg-surface-2/35 text-muted-foreground/70 line-through decoration-muted-foreground/40"
          : "border-hairline-soft bg-surface-2/70 text-foreground"
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <TagIcon className="size-3 shrink-0 text-primary/70" aria-hidden />
      <span className={cn("min-w-0 truncate font-medium", compact && "max-w-[8rem]")}>
        {tag.name}
      </span>
      {reuseExisting !== undefined ? (
        <ReuseBadge reuseExisting={reuseExisting} />
      ) : null}
    </span>
  );
}

function CollectionChip({
  collection,
  muted = false,
  compact = false,
}: {
  collection: OrbitCollectionSuggestion | { name: string; reuseExisting?: boolean };
  muted?: boolean;
  compact?: boolean;
}) {
  const reuseExisting =
    "reuseExisting" in collection ? collection.reuseExisting : undefined;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border py-0.5 pl-1.5 pr-1 text-[11px]",
        muted
          ? "border-hairline-soft/60 bg-surface-2/35 text-muted-foreground/70 line-through decoration-muted-foreground/40"
          : "border-hairline-soft bg-surface-2/70 text-foreground"
      )}
    >
      <FolderInput className="size-3 shrink-0 text-primary/70" aria-hidden />
      <span className={cn("min-w-0 truncate font-medium", compact && "max-w-[8rem]")}>
        {collection.name}
      </span>
      {reuseExisting !== undefined ? (
        <ReuseBadge reuseExisting={reuseExisting} />
      ) : null}
    </span>
  );
}

interface OrbitReviewGrokProposalProps {
  original: OrbitBookmarkSuggestion | null;
  decision: "keep" | "tags" | "collection" | "tags_collection";
  className?: string;
}

/** Read-only preview of Grok's proposed tags and collection. */
export function OrbitReviewGrokProposal({
  original,
  decision,
  className,
}: OrbitReviewGrokProposalProps) {
  if (!original) return null;

  const hasTags = original.tags.length > 0;
  const hasCollection = Boolean(original.collection);
  if (!hasTags && !hasCollection) {
    return (
      <p className={cn("text-xs text-muted-foreground/80", className)}>
        Grok suggests keeping this bookmark in Orbit unchanged.
      </p>
    );
  }

  const declined = decision === "keep";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        {declined ? "Grok proposed (not applying)" : "Grok proposed"}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {original.tags.map((tag) => (
          <TagChip key={tag.name} tag={tag} muted={declined} />
        ))}
        {original.collection ? (
          <CollectionChip collection={original.collection} muted={declined} />
        ) : null}
      </div>
    </div>
  );
}

interface OrbitReviewDraftImpactLineProps {
  tagNames: string[];
  collectionName: string | null;
  className?: string;
}

/** Compact summary of what the current draft will apply. */
export function OrbitReviewDraftImpactLine({
  tagNames,
  collectionName,
  className,
}: OrbitReviewDraftImpactLineProps) {
  if (tagNames.length === 0 && !collectionName) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        This item stays in Orbit unchanged.
      </p>
    );
  }

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className="text-foreground/90">If applied:</span>{" "}
      {tagNames.length > 0 ? (
        <span className="text-primary">
          +{tagNames.join(", ")}
        </span>
      ) : null}
      {tagNames.length > 0 && collectionName ? (
        <span className="text-muted-foreground"> → </span>
      ) : null}
      {collectionName ? (
        <span className="font-medium text-foreground">{collectionName}</span>
      ) : null}
    </p>
  );
}

interface OrbitReviewBatchImpactChipsProps {
  tagNames: string[];
  collectionNames: string[];
  className?: string;
}

/** Named batch impact for the review sidebar. */
export function OrbitReviewBatchImpactChips({
  tagNames,
  collectionNames,
  className,
}: OrbitReviewBatchImpactChipsProps) {
  if (tagNames.length === 0 && collectionNames.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No tags or collections will be applied in this pass.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        Batch impact
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tagNames.map((name) => (
          <TagChip key={name} tag={{ name }} compact />
        ))}
        {collectionNames.map((name) => (
          <CollectionChip key={name} collection={{ name }} compact />
        ))}
      </div>
    </div>
  );
}

interface OrbitReviewQueueProposalChipsProps {
  tagNames: string[];
  collectionName: string | null;
  className?: string;
}

/** Compact proposal chips for queue list items. */
export function OrbitReviewQueueProposalChips({
  tagNames,
  collectionName,
  className,
}: OrbitReviewQueueProposalChipsProps) {
  if (tagNames.length === 0 && !collectionName) return null;

  return (
    <div className={cn("mt-1.5 flex flex-wrap gap-1", className)}>
      {tagNames.slice(0, 2).map((name) => (
        <TagChip key={name} tag={{ name }} compact />
      ))}
      {tagNames.length > 2 ? (
        <span className="self-center text-[10px] text-muted-foreground">
          +{tagNames.length - 2} more
        </span>
      ) : null}
      {collectionName ? (
        <CollectionChip collection={{ name: collectionName }} compact />
      ) : null}
    </div>
  );
}
