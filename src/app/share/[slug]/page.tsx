import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Bookmark, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Bookmark className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight">MarkMaster</span>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="sm">
              Save to your MarkMaster
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            {collection.user.profileImageUrl && (
              <Image
                src={collection.user.profileImageUrl}
                alt={`${collection.user.displayName} avatar`}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full"
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
          <h1 className="text-3xl font-bold mb-2">{collection.name}</h1>
          {collection.description && (
            <p className="text-muted-foreground">{collection.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {collection.items.length} bookmark
            {collection.items.length !== 1 ? "s" : ""}
          </p>
        </div>

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
                              className="px-2 py-0.5 rounded bg-card text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
                            >
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
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Curated with MarkMaster
          </p>
          <Link href="/login">
            <Button size="sm">Start organizing your bookmarks</Button>
          </Link>
        </div>
      </footer>
    </div>
  );
}
