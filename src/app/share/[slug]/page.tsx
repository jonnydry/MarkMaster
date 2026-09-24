import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Bookmark, Users } from "lucide-react";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import Image from "next/image";
import { ShareBookmarkRow } from "@/components/share-bookmark-row";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { buttonVariantClassName } from "@/lib/button-variants";
import { prisma } from "@/lib/prisma";
import {
  PUBLIC_SHARE_REVALIDATE_SECONDS,
  publicShareCacheTag,
} from "@/lib/public-share-cache";
import { isShareLinkExpired } from "@/lib/share-content";
import { AppPublicPage } from "@/components/app-page-shell";
import { cn } from "@/lib/utils";
import { TagDot } from "@/components/tag-dot";

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

// unstable_cache gives cross-request data caching (tagged per slug, expired
// on publish/unpublish and collection edits); the React cache() wrapper on the
// shell dedupes the generateMetadata + page calls within a single request.
const getPublicCollectionShell = cache(async (slug: string) =>
  unstable_cache(
    async () =>
      prisma.collection.findFirst({
        where: {
          shareSlug: slug,
          isPublic: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          shareExpiresAt: true,
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
      }),
    ["public-share-shell", slug],
    {
      tags: [publicShareCacheTag(slug)],
      revalidate: PUBLIC_SHARE_REVALIDATE_SECONDS,
    }
  )()
);

// Expiry is checked at request time against the cached value (never inside
// the cached function), so an expired link 404s immediately instead of
// serving until the stale cache window closes.
const getActivePublicCollectionShell = async (slug: string) => {
  const collection = await getPublicCollectionShell(slug);
  if (!collection || isShareLinkExpired(collection.shareExpiresAt)) return null;
  return collection;
};

const getPublicCollectionStats = async (slug: string, collectionId: string) =>
  unstable_cache(
    async () => {
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
    },
    ["public-share-stats", collectionId],
    {
      tags: [publicShareCacheTag(slug)],
      revalidate: PUBLIC_SHARE_REVALIDATE_SECONDS,
    }
  )();

const getPublicCollectionItems = async (
  slug: string,
  collectionId: string,
  page: number
) =>
  unstable_cache(
    async () =>
      prisma.collectionItem.findMany({
        where: { collectionId },
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
    ["public-share-items", collectionId, String(page)],
    {
      tags: [publicShareCacheTag(slug)],
      revalidate: PUBLIC_SHARE_REVALIDATE_SECONDS,
    }
  )();

async function getPublicCollectionPage(slug: string, requestedPage: number) {
  const collection = await getActivePublicCollectionShell(slug);
  if (!collection) return null;

  const totalItems = collection._count.items;
  const totalPages = Math.max(1, Math.ceil(totalItems / PUBLIC_SHARE_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const [stats, items] = await Promise.all([
    getPublicCollectionStats(slug, collection.id),
    getPublicCollectionItems(slug, collection.id, page),
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
  const collection = await getActivePublicCollectionShell(slug);

  if (!collection) {
    return {
      title: "Collection not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description =
    collection.description ||
    `Public MarkMaster collection from ${collection.user.displayName} with ${collection._count.items} bookmarks.`;
  const title = collection.name;
  const socialTitle = `${collection.name} | MarkMaster`;

  return {
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: socialTitle,
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
  const returnToShareHref = `/login?callbackUrl=${encodeURIComponent(
    `/share/${slug}?page=${pagination.page}`
  )}`;

  return (
    <AppPublicPage className="bg-background">
      <header className="border-b border-hairline-soft bg-background">
        <div
          className={cn(
            bookmarkFeedColumnClassName,
            "flex h-14 items-center justify-between px-6"
          )}
        >
          <Link href="/" className="flex items-center gap-2">
            <MarkMasterLogo width={28} height={28} className="shrink-0" />
            <span className="font-semibold">MarkMaster</span>
          </Link>
          <Link
            href={returnToShareHref}
            className={buttonVariantClassName("outline", "sm")}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className={cn(bookmarkFeedColumnClassName, "px-6 py-8")}>
        <section className="mb-2 border-b border-hairline-soft pb-6">
          <div className="min-w-0">
            <div className="mb-4 flex items-center gap-3">
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
            <h1 className="heading-font text-3xl font-bold sm:text-4xl">
              {collection.name}
            </h1>
            {collection.description && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {collection.description}
              </p>
            )}
          </div>

          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Bookmark className="size-3.5" aria-hidden="true" />
              <span>
                <span className="font-semibold tabular-nums text-foreground">
                  {pagination.totalItems.toLocaleString()}
                </span>{" "}
                {pagination.totalItems === 1 ? "bookmark" : "bookmarks"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden="true" />
              <span>
                <span className="font-semibold tabular-nums text-foreground">
                  {authorCount.toLocaleString()}
                </span>{" "}
                {authorCount === 1 ? "author" : "authors"}
              </span>
            </span>
          </p>

          {topTags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {topTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-hairline-soft px-2 py-1 text-xs font-medium text-muted-foreground"
                >
                  <TagDot name={tag.name} color={tag.color} size={8} />
                  {tag.name}
                  <span className="tabular-nums">{tag.count}</span>
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

      <footer className="mt-12 border-t border-hairline-soft px-6 py-10">
        <div className={cn(bookmarkFeedColumnClassName, "text-center")}>
          <p className="mb-4 text-sm text-muted-foreground">
            Curated with MarkMaster — built for people who save too much.
          </p>
          <Link href="/login" className={buttonVariantClassName(undefined, "sm")}>
            Organize your X bookmarks
          </Link>
        </div>
      </footer>
    </AppPublicPage>
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
      className="mt-6 flex items-center justify-between border-t border-hairline-soft pt-4"
    >
      {hasPrevious ? (
        <Link
          href={`/share/${slug}?page=${page - 1}`}
          className={buttonVariantClassName("outline", "sm")}
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
          className={buttonVariantClassName("outline", "sm")}
        >
          Next
        </Link>
      ) : (
        <span aria-hidden className="h-9 w-20" />
      )}
    </nav>
  );
}
