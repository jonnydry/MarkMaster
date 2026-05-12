import React from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArchiveX,
  Copy,
  FolderOpen,
  Globe2,
  Layers2,
  LockKeyhole,
} from "lucide-react";
import type { CollectionWithCount } from "@/types";

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
}

function formatCollectionDate(value: Date | string) {
  return collectionDateFormatter.format(new Date(value));
}

function itemLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "bookmark" : "bookmarks"}`;
}

const compactCardClassName =
  "group relative flex min-h-[5.4rem] cursor-pointer items-center gap-3 overflow-hidden rounded-sm border border-hairline-soft bg-surface-1/75 px-3.5 py-3 text-left shadow-sm transition-colors hover:border-primary/25 hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 [content-visibility:auto] [contain-intrinsic-size:88px]";

function getScaleWidth(itemCount: number, maxItems: number) {
  if (itemCount <= 0 || maxItems <= 0) return 0;
  return Math.max(8, Math.round((itemCount / maxItems) * 100));
}

function handleRowKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  collectionId: string,
  onNavigate: (id: string) => void
) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  onNavigate(collectionId);
}

export const UserCollectionCard = React.memo(function UserCollectionCard({
  collection,
  maxItems,
  onNavigate,
  onDelete,
}: UserCollectionCardProps) {
  const itemCount = collection._count?.items ?? 0;
  const createdAt = formatCollectionDate(collection.createdAt);
  const scaleWidth = getScaleWidth(itemCount, maxItems);

  return (
    <article
      className={compactCardClassName}
      role="button"
      tabIndex={0}
      aria-label={`Open collection ${collection.name}`}
      onClick={() => onNavigate(collection.id)}
      onKeyDown={(event) => handleRowKeyDown(event, collection.id, onNavigate)}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-primary/15 bg-primary/10 text-primary">
        <Layers2 className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {collection.name}
          </h3>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-hairline-soft bg-transparent px-1.5 py-0.5 text-[0.68rem] font-semibold text-muted-foreground"
            title={collection.isPublic ? "Public collection" : "Private collection"}
          >
            {collection.isPublic ? (
              <Globe2 className="h-3 w-3 text-success" aria-hidden="true" />
            ) : (
              <LockKeyhole className="h-3 w-3" aria-hidden="true" />
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
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${scaleWidth}%` }}
          />
        </div>
      </div>

      <div className="hidden min-w-[4.75rem] shrink-0 text-right sm:block">
        <p className="heading-font text-lg font-bold leading-none tabular-nums text-foreground">
          {itemCount.toLocaleString()}
        </p>
        <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          saved
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ArrowRight className="hidden h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-primary sm:block" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          aria-label={`Delete collection ${collection.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(collection.id);
          }}
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
}

export const XFolderCard = React.memo(function XFolderCard({
  collection,
  maxItems,
  onNavigate,
  onCopy,
}: XFolderCardProps) {
  const itemCount = collection._count?.items ?? 0;
  const createdAt = formatCollectionDate(collection.createdAt);
  const scaleWidth = getScaleWidth(itemCount, maxItems);

  return (
    <article
      className={compactCardClassName}
      role="button"
      tabIndex={0}
      aria-label={`Open collection ${collection.name}`}
      onClick={() => onNavigate(collection.id)}
      onKeyDown={(event) => handleRowKeyDown(event, collection.id, onNavigate)}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-note/15 bg-note/10 text-note">
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {collection.name}
          </h3>
          <span className="inline-flex shrink-0 rounded-sm border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[0.68rem] font-semibold text-primary">
            X Folder
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
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-note transition-all duration-700 ease-out"
            style={{ width: `${scaleWidth}%` }}
          />
        </div>
      </div>

      <div className="hidden min-w-[4.75rem] shrink-0 text-right sm:block">
        <p className="heading-font text-lg font-bold leading-none tabular-nums text-foreground">
          {itemCount.toLocaleString()}
        </p>
        <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          synced
        </p>
      </div>

      <div className="shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(collection.id);
          }}
        >
          <Copy className="w-3.5 h-3.5" />
          Copy
        </Button>
      </div>
    </article>
  );
});
