import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactElement } from "react";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import Image from "next/image";
import { ShareBookmarkRow } from "@/components/share-bookmark-row";
import { MarkMasterLogo } from "@/components/markmaster-logo";
import type { BookmarkMediaJson } from "@/lib/bookmark-media";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import { buttonVariantClassName } from "@/lib/button-variants";
import { prisma } from "@/lib/prisma";
import { AppPublicPage } from "@/components/app-page-shell";
import { appChromeFrostedClassName } from "@/lib/app-chrome";
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
    <AppPublicPage className="bg-background">
      <header className={cn("border-b border-hairline-soft", appChromeFrostedClassName)}>
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
            className={buttonVariantClassName("outline", "sm")}
          >
            Save to your MarkMaster
          </Link>
        </div>
      </header>

      <main className={cn(bookmarkFeedColumnClassName, "px-6 py-8")}>
        <section className="mb-8 border-b border-border pb-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
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
              <h1 className="heading-font text-3xl font-bold tracking-tight sm:text-4xl">
                {collection.name}
              </h1>
              {collection.description && (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {collection.description}
                </p>
              )}
            </div>
            <Link
              href="/login"
              className={buttonVariantClassName(undefined, undefined, "gap-2")}
            >
              Save to your library
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <ShareStat
              icon={BookmarkIcon}
              label="Bookmarks"
              value={pagination.totalItems.toLocaleString()}
            />
            <ShareStat
              icon={UsersIcon}
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
                  <TagDot name={tag.name} color={tag.color} size={8} />
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

      <footer className="mt-12 border-t border-border px-6 py-8">
        <div className={cn(bookmarkFeedColumnClassName, "text-center")}>
          <p className="mb-4 text-sm text-muted-foreground">
            Curated with MarkMaster
          </p>
          <Link href="/login" className={buttonVariantClassName(undefined, "sm")}>
            Start organizing your bookmarks
          </Link>
        </div>
      </footer>
    </AppPublicPage>
  );
}

type ShareStatIcon = (props: { className?: string }) => ReactElement;

function ShareStat({
  icon: Icon,
  label,
  value,
}: {
  icon: ShareStatIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-inset-strong px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="heading-font mt-1 text-lg font-semibold tabular-nums">
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

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
