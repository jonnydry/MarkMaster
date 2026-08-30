import { revalidateTag } from "next/cache";

/**
 * Data-cache plumbing for the public share page (/share/[slug]).
 *
 * The page itself stays dynamic (it reads searchParams for pagination), but
 * its Prisma queries are wrapped in unstable_cache with a per-slug tag so
 * anonymous/crawler traffic stops hitting the database on every request.
 */

export const PUBLIC_SHARE_REVALIDATE_SECONDS = 300;

export function publicShareCacheTag(slug: string) {
  return `public-share:${slug}`;
}

/**
 * Expire a share slug's cached data immediately. Used on publish/unpublish
 * and collection edits — unpublishing is a revocation, so stale-while-
 * revalidate semantics are not acceptable here.
 */
export function expirePublicShareCache(slug: string | null | undefined) {
  if (!slug) return;
  revalidateTag(publicShareCacheTag(slug), { expire: 0 });
}
