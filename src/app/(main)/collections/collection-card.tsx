import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Lock, Trash2, FolderOpen, Copy, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStaggerClass } from "@/lib/stagger";
import type { CollectionWithCount } from "@/types";

interface UserCollectionCardProps {
  collection: CollectionWithCount;
  index: number;
  onNavigate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const UserCollectionCard = React.memo(function UserCollectionCard({
  collection,
  index,
  onNavigate,
  onDelete,
}: UserCollectionCardProps) {
  return (
    <Card
      className={`group cursor-pointer border-hairline-soft bg-surface-1 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${getStaggerClass(index, "animate-fade-in-up") ?? ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(collection.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNavigate(collection.id);
        }
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <span className="font-semibold">{collection.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {collection.isPublic ? (
            <Globe className="w-4 h-4 text-success" />
          ) : (
            <Lock className="w-4 h-4 text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive"
            aria-label={`Delete collection ${collection.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(collection.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {collection.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {collection.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {collection._count?.items ?? 0} bookmark
          {(collection._count?.items ?? 0) !== 1 ? "s" : ""}
        </span>
        <span>{new Date(collection.createdAt).toLocaleDateString()}</span>
      </div>
    </Card>
  );
});

interface XFolderCardProps {
  collection: CollectionWithCount;
  index: number;
  onNavigate: (id: string) => void;
  onCopy: (id: string) => void;
}

export const XFolderCard = React.memo(function XFolderCard({
  collection,
  index,
  onNavigate,
  onCopy,
}: XFolderCardProps) {
  return (
    <Card
      className={`group cursor-pointer border-hairline-soft bg-surface-1 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${getStaggerClass(index, "animate-fade-in-up") ?? ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(collection.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNavigate(collection.id);
        }
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">{collection.name}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(collection.id);
          }}
        >
          <Copy className="w-3.5 h-3.5" />
          Copy
        </Button>
      </div>
      <Badge variant="outline" className="text-primary border-primary/30 mb-2">
        Synced from X
      </Badge>
      {collection.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {collection.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {collection._count?.items ?? 0} bookmark
          {(collection._count?.items ?? 0) !== 1 ? "s" : ""}
        </span>
        <span>{new Date(collection.createdAt).toLocaleDateString()}</span>
      </div>
    </Card>
  );
});
