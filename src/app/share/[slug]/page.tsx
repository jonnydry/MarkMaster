import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  Bookmark,
  ExternalLink,
  type LucideIcon,
  Tag as TagIcon,
  Users,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { ShareBookmarkRow } from "@/components/share-bookmark-row";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";

const PUBLIC_SHARE_PAGE_SIZE = 50;
const MAX_PUBLIC_SHARE_PAGE = 200;

function parsePublicSharePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number(rawValue);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, MAX_PUBLIC_SHARE_PAGE);
}

const publicBookmarkSelect = {
  id: true,
  tweetId: true,
  authorUsername: true,
  authorDisplayName: true,
  authorProfileImage: true,
  tweetText: true,
  media: true,
  tweetCreatedAt: true,
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
} satisfies Prisma.BookmarkSelect;

const getPublicCollectionShell = cache(async (slug: string) => {
  return prisma.collection.findFirst({
    where: {
      shareSlug: slug,
      isPublic: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      user: {
        select: {
          username: true,
          displayName: true,
          profileImageUrl: true,
        },
      },
      _count: {
        select: { items: true },
      },
    },
  });
});

const getPublicCollectionStats = cache(async (collectionId: string) => {
  const [authorRows, tagRows] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT b."authorUsername")::bigint AS count
      FROM "CollectionItem" ci
      INNER JOIN "Bookmark" b ON b."id" = ci."bookmarkId"
      WHERE ci."collectionId" = ${collectionId}
    `),
    prisma.$queryRaw<
      { id: string; name: string; color: string; count: bigint }[]
    >(Prisma.sql`
      SELECT t."id", t."name", t."color", COUNT(*)::bigint AS count
      FROM "CollectionItem" ci
      INNER JOIN "BookmarkTag" bt ON bt."bookmarkId" = ci."bookmarkId"
      INNER JOIN "Tag" t ON t."id" = bt."tagId"
      WHERE ci."collectionId" = ${collectionId}
      GROUP BY t."id", t."name", t."color"
      ORDER BY count DESC, t."name" ASC
      LIMIT 6
    `),
  ]);

  return {
    authorCount: Number(authorRows[0]?.count ?? 0),
    topTags: tagRows.map((tag) => ({
      ...tag,
      count: Number(tag.count),
    })),
  };
});

async function getPublicCollectionPage(slug: string, requestedPage: number) {
  const collection = await getPublicCollectionShell(slug);
  if (!collection) return null;

  const totalItems = collection._count.items;
  const totalPages = Math.max(1, Math.ceil(totalItems / PUBLIC_SHARE_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const [stats, items] = await Promise.all([
    getPublicCollectionStats(collection.id),
    prisma.collectionItem.findMany({
      where: { collectionId: collection.id },
      select: {
        id: true,
        bookmark: {
          select: publicBookmarkSelect,
        },
      },
      orderBy: { sortOrder: "asc" },
      skip: (page - 1) * PUBLIC_SHARE_PAGE_SIZE,
      take: PUBLIC_SHARE_PAGE_SIZE,
    }),
  ]);

  return {
    ...collection,
    ...stats,
    items,
    pagination: {
      page,
      totalPages,
      totalItems,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublicCollectionShell(slug);

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
    `Public MarkMaster collection from ${collection.user.displayName} with ${collection._count.items} bookmarks.`;
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedPage = parsePublicSharePage(query?.page);

  const collection = await getPublicCollectionPage(slug, requestedPage);

  if (!collection) {
    notFound();
  }

  const { pagination, topTags, authorCount } = collection;

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
                value={pagination.totalItems.toLocaleString()}
              />
            <ShareStat
              icon={Users}
              label="Authors"
              value={authorCount.toLocaleString()}
            />
              <ShareStat
                icon={TagIcon}
                label="Top tags"
                value={topTags.length.toLocaleString()}
              />
          </div>

          {topTags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {topTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground"
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
            const media = Array.isArray(b.media)
              ? (b.media as BookmarkMediaJson[])
              : null;

            return (
              <ShareBookmarkRow
                key={item.id}
                id={b.id}
                tweetId={b.tweetId}
                authorUsername={b.authorUsername}
                authorDisplayName={b.authorDisplayName}
                authorProfileImage={b.authorProfileImage}
                tweetText={b.tweetText}
                tweetCreatedAt={b.tweetCreatedAt}
                media={media}
                tags={b.tags}
              />
            );
          })}
        </div>

        {pagination.totalPages > 1 ? (
          <SharePagination
            slug={slug}
            page={pagination.page}
            totalPages={pagination.totalPages}
            hasPrevious={pagination.hasPrevious}
            hasNext={pagination.hasNext}
          />
        ) : null}
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
    <div className="rounded-sm border border-border bg-secondary/50 px-3 py-2.5">
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

function SharePagination({
  slug,
  page,
  totalPages,
  hasPrevious,
  hasNext,
}: {
  slug: string;
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  return (
    <nav
      aria-label="Shared collection pagination"
      className="mt-6 flex items-center justify-between border-t border-border pt-4"
    >
      {hasPrevious ? (
        <Link
          href={`/share/${slug}?page=${page - 1}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Previous
        </Link>
      ) : (
        <span aria-hidden className="h-9 w-20" />
      )}

      <span className="text-xs text-muted-foreground">
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </span>

      {hasNext ? (
        <Link
          href={`/share/${slug}?page=${page + 1}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Next
        </Link>
      ) : (
        <span aria-hidden className="h-9 w-20" />
      )}
    </nav>
  );
}
