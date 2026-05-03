import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  Bookmark,
  ExternalLink,
  type LucideIcon,
  Tag as TagIcon,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";

const getPublicCollection = cache(async (slug: string) => {
  return prisma.collection.findFirst({
    where: {
      shareSlug: slug,
      isPublic: true,
    },
    include: {
      user: {
        select: {
          username: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
      items: {
        include: {
          bookmark: {
            include: { tags: { include: { tag: true } } },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublicCollection(slug);

  if (!collection) {
    return {
      title: "Collection not found | MarkMaster",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description =
    collection.description ||
    `Public MarkMaster collection from ${collection.user.displayName} with ${collection.items.length} bookmarks.`;
  const title = `${collection.name} | MarkMaster`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const collection = await getPublicCollection(slug);

  if (!collection) {
    notFound();
  }

  const topTags = Array.from(
    collection.items
      .flatMap((item) => item.bookmark.tags.map(({ tag }) => tag))
      .reduce((acc, tag) => {
        const current = acc.get(tag.id);
        acc.set(tag.id, {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          count: (current?.count ?? 0) + 1,
        });
        return acc;
      }, new Map<string, { id: string; name: string; color: string; count: number }>())
      .values()
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const authorCount = new Set(
    collection.items.map((item) => item.bookmark.authorUsername)
  ).size;

  return (
    <div className="app-min-viewport bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div
          className={cn(
            bookmarkFeedColumnClassName,
            "flex h-14 items-center justify-between px-6"
          )}
        >
          <Link href="/" className="flex items-center gap-2">
            <MarkMasterLogo width={28} height={28} className="shrink-0" />
            <span className="font-bold tracking-tight">MarkMaster</span>
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Save to your MarkMaster
          </Link>
        </div>
      </header>

      <main className={cn(bookmarkFeedColumnClassName, "px-6 py-8")}>
        <section className="mb-8 border-b border-border pb-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-4">
                {collection.user.profileImageUrl && (
                  <Image
                    src={collection.user.profileImageUrl}
                    alt={`${collection.user.displayName} avatar`}
                    width={36}
                    height={36}
                    className="size-9 rounded-full"
                  />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {collection.user.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{collection.user.username}
                  </p>
                </div>
              </div>
              <h1 className="heading-font text-3xl font-bold tracking-tight sm:text-4xl">
                {collection.name}
              </h1>
              {collection.description && (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {collection.description}
                </p>
              )}
            </div>
            <Link href="/login" className={cn(buttonVariants(), "gap-2")}>
              Save to your library
              <ExternalLink className="size-3.5" />
            </Link>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <ShareStat
              icon={Bookmark}
              label="Bookmarks"
              value={collection.items.length.toLocaleString()}
            />
            <ShareStat
              icon={Users}
              label="Authors"
              value={authorCount.toLocaleString()}
            />
            <ShareStat
              icon={TagIcon}
              label="Tags"
              value={topTags.length.toLocaleString()}
            />
          </div>

          {topTags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {topTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  {tag.name}
                  <span className="text-muted-foreground/60">{tag.count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <div className="space-y-0">
          {collection.items.map((item) => {
            const b = item.bookmark;
            const tweetUrl = `https://x.com/${b.authorUsername}/status/${b.tweetId}`;

            return (
              <div
                key={item.id}
                className="py-4 border-b border-border last:border-0"
              >
                <div className="flex gap-3">
                  {b.authorProfileImage && (
                    <Image
                      src={b.authorProfileImage}
                      alt={`${b.authorDisplayName} avatar`}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">
                        {b.authorDisplayName}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        @{b.authorUsername}
                      </span>
                      <span className="text-muted-foreground text-sm">·</span>
                      <span className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(b.tweetCreatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">
                      {b.tweetText}
                    </p>
                    {b.tags.length > 0 && (
                      <div className="flex gap-1.5 mt-2">
                        {b.tags.map(
                          ({
                            tag,
                          }: {
                            tag: { id: string; name: string; color: string };
                          }) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary text-xs font-medium text-muted-foreground"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: tag.color }}
                                aria-hidden="true"
                              />
                              {tag.name}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    <a
                      href={tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                    >
                      View on X
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border py-8 px-6 mt-12">
        <div className={cn(bookmarkFeedColumnClassName, "text-center")}>
          <p className="text-sm text-muted-foreground mb-4">
            Curated with MarkMaster
          </p>
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            Start organizing your bookmarks
          </Link>
        </div>
      </footer>
    </div>
  );
}

function ShareStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1 heading-font text-lg font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
