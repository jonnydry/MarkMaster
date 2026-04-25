import React from "react";
import { Button } from "@/components/ui/button";
import {
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
  "group flex min-h-[4.75rem] cursor-pointer items-center gap-3 rounded-xl border border-hairline-soft bg-surface-1 px-3 py-2.5 text-left transition-colors hover:border-primary/25 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 [content-visibility:auto] [contain-intrinsic-size:76px]";

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
  onNavigate,
  onDelete,
}: UserCollectionCardProps) {
  const itemCount = collection._count?.items ?? 0;
  const createdAt = formatCollectionDate(collection.createdAt);

  return (
    <article
      className={compactCardClassName}
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(collection.id)}
      onKeyDown={(event) => handleRowKeyDown(event, collection.id, onNavigate)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline-soft bg-surface-2 text-primary">
        <Layers2 className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {collection.name}
          </h3>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hairline-soft bg-surface-2 px-1.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground"
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
      </div>

      <div className="flex shrink-0 items-center gap-1">
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
  onNavigate: (id: string) => void;
  onCopy: (id: string) => void;
}

export const XFolderCard = React.memo(function XFolderCard({
  collection,
  onNavigate,
  onCopy,
}: XFolderCardProps) {
  const itemCount = collection._count?.items ?? 0;
  const createdAt = formatCollectionDate(collection.createdAt);

  return (
    <article
      className={compactCardClassName}
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(collection.id)}
      onKeyDown={(event) => handleRowKeyDown(event, collection.id, onNavigate)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline-soft bg-surface-2 text-muted-foreground">
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {collection.name}
          </h3>
          <span className="inline-flex shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[0.68rem] font-medium text-primary">
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
