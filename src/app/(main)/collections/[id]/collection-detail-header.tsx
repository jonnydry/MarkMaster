import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Layers,
  Lock,
  Share2,
  Timer,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { highlightActiveClass } from "@/lib/highlight-chrome";
import { isShareLinkExpired } from "@/lib/share-content";
import { cn } from "@/lib/utils";
import type { CollectionDetail } from "@/hooks/use-collection-detail-page";

export type ShareExpiryDays = 7 | 30 | 90 | null;

const DAY_MS = 24 * 60 * 60 * 1000;

function shareExpiryStatusLabel(shareExpiresAt: string | null): string {
  if (!shareExpiresAt) return "Never expires";
  if (isShareLinkExpired(shareExpiresAt)) return "Link expired";
  const remainingDays = Math.ceil(
    (new Date(shareExpiresAt).getTime() - Date.now()) / DAY_MS
  );
  return remainingDays === 1 ? "Expires in 1 day" : `Expires in ${remainingDays} days`;
}

function ShareExpirySelect({
  shareExpiresAt,
  onShareExpiryChange,
}: {
  shareExpiresAt: string | null;
  onShareExpiryChange: (days: ShareExpiryDays) => void;
}) {
  return (
    <Select
      value={shareExpiresAt ? null : "never"}
      onValueChange={(value: string | null) => {
        if (!value) return;
        onShareExpiryChange(
          value === "never" ? null : (Number(value) as ShareExpiryDays)
        );
      }}
    >
      <SelectTrigger
        size="lg"
        aria-label="Share link expiry"
        className={cn(
          "gap-1.5 border-hairline-soft bg-transparent px-3 text-sm",
          isShareLinkExpired(shareExpiresAt) && "text-destructive"
        )}
      >
        <Timer className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {shareExpiryStatusLabel(shareExpiresAt)}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="never">Never</SelectItem>
        <SelectItem value="7">7 days</SelectItem>
        <SelectItem value="30">30 days</SelectItem>
        <SelectItem value="90">90 days</SelectItem>
      </SelectContent>
    </Select>
  );
}

type CollectionDetailHeaderActionsProps = {
  collection: CollectionDetail;
  sortedItemCount: number;
  isSyncedFromX: boolean;
  isUserCollection: boolean;
  onCopyAsCollection: () => void;
  onTogglePublic: () => void;
  onShareExpiryChange: (days: ShareExpiryDays) => void;
  onCopyShareLink: () => void;
  onShareOnX: () => void;
};

export function CollectionDetailHeaderActions({
  collection,
  sortedItemCount,
  isSyncedFromX,
  isUserCollection,
  onCopyAsCollection,
  onTogglePublic,
  onShareExpiryChange,
  onCopyShareLink,
  onShareOnX,
}: CollectionDetailHeaderActionsProps) {
  return (
    <>
      {isSyncedFromX && (
        <>
          <Badge
            variant="outline"
            className={cn("gap-1.5 text-primary", highlightActiveClass)}
          >
            Synced from X
          </Badge>
          <Button
            variant="outline"
            size="lg"
            className="gap-1.5 border-hairline-soft bg-transparent px-3 text-sm"
            onClick={onCopyAsCollection}
          >
            <Copy className="size-4" />
            Copy as Collection
          </Button>
        </>
      )}
      {isUserCollection && (
        <Badge variant="outline" className="gap-1.5 border-hairline-soft bg-surface-2/70">
          {collection.isPublic ? (
            <Globe className="h-3 w-3 text-success" />
          ) : (
            <Lock className="h-3 w-3" />
          )}
          {collection.isPublic ? "Public" : "Private"}
        </Badge>
      )}
      {isUserCollection && (
        <>
          <Button
            variant="outline"
            size="lg"
            className="border-hairline-soft bg-transparent px-3 text-sm"
            onClick={onTogglePublic}
          >
            {collection.isPublic ? "Make Private" : "Make Public"}
          </Button>
          {collection.isPublic && collection.shareSlug && (
            <>
              <ShareExpirySelect
                shareExpiresAt={collection.shareExpiresAt}
                onShareExpiryChange={onShareExpiryChange}
              />
              <Button
                variant="outline"
                size="lg"
                className="gap-1.5 border-hairline-soft bg-transparent px-3 text-sm"
                onClick={onCopyShareLink}
              >
                <Copy className="size-4" />
                Copy Link
              </Button>
              <a
                href={`/share/${collection.shareSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-9 items-center justify-center rounded-sm border border-hairline-soft bg-transparent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                aria-label="Open public collection page"
                title="Open public collection page"
              >
                <ExternalLink className="size-4" />
              </a>
            </>
          )}
          {sortedItemCount > 0 && collection.isPublic && collection.shareSlug && (
            <Button
              variant="default"
              size="lg"
              className="gap-1.5 px-3 text-sm"
              onClick={onShareOnX}
            >
              <Share2 className="size-4" />
              Share on X
            </Button>
          )}
        </>
      )}
    </>
  );
}

type CollectionDetailTitleProps = {
  collection: CollectionDetail;
  editingName: boolean;
  name: string;
  isSyncedFromX: boolean;
  isUserCollection: boolean;
  onNameChange: (value: string) => void;
  onUpdateName: () => void;
  onCancelEditingName: () => void;
  onStartEditingName: () => void;
};

export function CollectionDetailTitle({
  collection,
  editingName,
  name,
  isSyncedFromX,
  isUserCollection,
  onNameChange,
  onUpdateName,
  onCancelEditingName,
  onStartEditingName,
}: CollectionDetailTitleProps) {
  if (editingName) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onBlur={onUpdateName}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void onUpdateName();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancelEditingName();
          }
        }}
        className="w-full border-b border-primary bg-transparent pb-1 text-2xl font-bold tracking-tight heading-font outline-none focus-visible:ring-2 focus-visible:ring-ring/45 sm:text-3xl"
      />
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {isSyncedFromX ? (
        <FolderOpen className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <Layers className="h-6 w-6 shrink-0 text-primary" aria-hidden />
      )}
      {isSyncedFromX || !isUserCollection ? (
        collection.name
      ) : (
        <button
          type="button"
          className="max-w-full truncate rounded-sm text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
          onClick={onStartEditingName}
          aria-label={`Edit collection name ${collection.name}`}
        >
          {collection.name}
        </button>
      )}
    </span>
  );
}

export function CollectionDetailBackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon-xl"
      className="shrink-0 border-hairline-soft bg-transparent"
      onClick={onBack}
      aria-label="Back to collections"
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}
