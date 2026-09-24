"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArchiveX, Copy, Globe2, LockKeyhole } from "lucide-react";
import type { CollectionWithCount } from "@/types";

import { cn } from "@/lib/utils";

const collectionDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

interface UserCollectionCardProps {
  collection: CollectionWithCount;
  maxItems: number;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
  selected?: boolean;
}

function formatCollectionDate(value: Date | string) {
  return collectionDateFormatter.format(new Date(value));
}

function itemLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "bookmark" : "bookmarks"}`;
}

const compactCardBaseClassName =
  "group relative flex min-h-[4.5rem] items-stretch gap-1 overflow-hidden p-1.5 text-left transition-colors [content-visibility:auto] [contain-intrinsic-size:72px]";

function cardClassName(selected: boolean) {
  return cn(
    compactCardBaseClassName,
    selected
      ? "rounded-sm border border-hairline-soft state-selected"
      : "surface-card hover:bg-hover"
  );
}

const collectionCardMainButtonClassName =
  "absolute inset-1.5 z-0 cursor-pointer rounded-sm border border-transparent focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45";

const collectionCardContentClassName =
  "pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5";

function getScaleWidth(itemCount: number, maxItems: number) {
  if (itemCount <= 0 || maxItems <= 0) return 0;
  return Math.max(4, Math.round((itemCount / maxItems) * 100));
}

/** Quiet 2px underline comparing this collection's size to the largest one. */
function RelativeSizeBar({ percent, name }: { percent: number; name: string }) {
  return (
    <div
      className="mt-2 h-0.5 w-full overflow-hidden rounded-[2px] bg-surface-3"
      role="meter"
      aria-label={`${name} size relative to your largest collection`}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-[2px] bg-primary/50 transition-colors group-hover:bg-primary/70"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export const UserCollectionCard = React.memo(function UserCollectionCard({
  collection,
  maxItems,
  onNavigate,
  onDelete,
  selected = false,
}: UserCollectionCardProps) {
  const itemCount = collection._count?.items ?? 0;
  const createdAt = formatCollectionDate(collection.createdAt);
  const scaleWidth = getScaleWidth(itemCount, maxItems);

  return (
    <article
      data-collection-id={collection.id}
      className={cardClassName(selected)}
    >
      <button
        type="button"
        className={collectionCardMainButtonClassName}
        aria-label={`Open collection ${collection.name}`}
        aria-current={selected ? "page" : undefined}
        onClick={() => onNavigate(collection.id)}
      />
      <div className={collectionCardContentClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {collection.name}
            </h3>
            <span
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
              title={collection.isPublic ? "Public collection" : "Private collection"}
            >
              {collection.isPublic ? (
                <Globe2 className="size-3" aria-hidden="true" />
              ) : (
                <LockKeyhole className="size-3" aria-hidden="true" />
              )}
              {collection.isPublic ? "Public" : "Private"}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{itemLabel(itemCount)}</span>
            <span aria-hidden="true">·</span>
            <span>{createdAt}</span>
            {collection.description ? (
              <>
                <span aria-hidden="true" className="hidden sm:inline">
                  ·
                </span>
                <span className="hidden min-w-0 max-w-[26rem] truncate sm:inline">
                  {collection.description}
                </span>
              </>
            ) : null}
          </div>
          <RelativeSizeBar percent={scaleWidth} name={collection.name} />
        </div>
      </div>

      <div className="relative z-20 flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-full w-10 text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          aria-label={`Delete collection ${collection.name}`}
          onClick={() => onDelete(collection.id)}
        >
          <ArchiveX className="w-3.5 h-3.5" />
        </Button>
      </div>
    </article>
  );
});

interface XFolderCardProps {
  collection: CollectionWithCount;
  maxItems: number;
  onNavigate: (id: string) => void;
  onCopy: (id: string) => void;
  selected?: boolean;
}

export const XFolderCard = React.memo(function XFolderCard({
  collection,
  maxItems,
  onNavigate,
  onCopy,
  selected = false,
}: XFolderCardProps) {
  const itemCount = collection._count?.items ?? 0;
  const createdAt = formatCollectionDate(collection.createdAt);
  const scaleWidth = getScaleWidth(itemCount, maxItems);

  return (
    <article
      data-collection-id={collection.id}
      className={cardClassName(selected)}
    >
      <button
        type="button"
        className={collectionCardMainButtonClassName}
        aria-label={`Open X folder ${collection.name}`}
        aria-current={selected ? "page" : undefined}
        onClick={() => onNavigate(collection.id)}
      />
      <div className={collectionCardContentClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {collection.name}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground">
              X folder
            </span>
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{itemLabel(itemCount)}</span>
            <span aria-hidden="true">·</span>
            <span>{createdAt}</span>
            {collection.description ? (
              <>
                <span aria-hidden="true" className="hidden sm:inline">
                  ·
                </span>
                <span className="hidden min-w-0 max-w-[26rem] truncate sm:inline">
                  {collection.description}
                </span>
              </>
            ) : null}
          </div>
          <RelativeSizeBar percent={scaleWidth} name={collection.name} />
        </div>
      </div>

      <div className="relative z-20 flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-full gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onCopy(collection.id)}
        >
          <Copy className="w-3.5 h-3.5" />
          Copy
        </Button>
      </div>
    </article>
  );
});
