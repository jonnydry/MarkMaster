"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { BookmarkPostPreview } from "@/components/bookmark-post-preview";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { getBookmarkTweetUrl } from "@/lib/bookmark-url";

export interface ShareBookmarkRowProps {
  id: string;
  tweetId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorProfileImage: string | null;
  tweetText: string;
  tweetCreatedAt: Date | string;
  media: BookmarkMediaJson[] | null;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
}

export function ShareBookmarkRow({
  id,
  tweetId,
  authorUsername,
  authorDisplayName,
  authorProfileImage,
  tweetText,
  tweetCreatedAt,
  media,
  tags,
}: ShareBookmarkRowProps) {
  const tweetUrl = getBookmarkTweetUrl({ authorUsername, tweetId });
  const createdAt =
    typeof tweetCreatedAt === "string"
      ? new Date(tweetCreatedAt)
      : tweetCreatedAt;

  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex gap-3">
        {authorProfileImage ? (
          <Image
            src={authorProfileImage}
            alt={`${authorDisplayName} avatar`}
            width={40}
            height={40}
            className="w-10 h-10 rounded-full shrink-0"
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm">{authorDisplayName}</span>
            <span className="text-muted-foreground text-sm">
              @{authorUsername}
            </span>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(createdAt, { addSuffix: true })}
            </span>
          </div>
          <BookmarkPostPreview
            tweetText={tweetText}
            authorUsername={authorUsername}
            media={media}
            tweetLink={{ authorUsername, tweetId }}
            bookmarkKey={id}
            variant="inline"
            textClassName="text-sm mt-1 whitespace-pre-wrap leading-relaxed"
            galleryClassName="!mt-2"
          />
          {tags.length > 0 ? (
            <div className="flex gap-1.5 mt-2">
              {tags.map(({ tag }) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-secondary text-xs font-medium text-muted-foreground"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
          {tweetUrl ? (
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              View on X
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
