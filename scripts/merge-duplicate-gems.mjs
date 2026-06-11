// One-off: merge duplicate "This Week's Gems" collections per user into the
// oldest one, moving items (skipping duplicates) and deleting the extras.
// Usage: node scripts/merge-duplicate-gems.mjs [--apply]
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const normalize = (name) => name.replace(/[’‘]/g, "'").trim().toLowerCase();
const TARGET = "this week's gems";

const collections = await prisma.collection.findMany({
  where: { type: "user_collection" },
  select: {
    id: true,
    userId: true,
    name: true,
    createdAt: true,
    _count: { select: { items: true } },
  },
  orderBy: { createdAt: "asc" },
});

const byUser = new Map();
for (const c of collections) {
  if (normalize(c.name) !== TARGET) continue;
  const list = byUser.get(c.userId) ?? [];
  list.push(c);
  byUser.set(c.userId, list);
}

let mergedUsers = 0;
for (const [userId, list] of byUser) {
  if (list.length < 2) continue;
  mergedUsers += 1;
  const [keep, ...dupes] = list;
  console.log(
    `user ${userId}: keeping ${keep.id} (${keep._count.items} items), merging ${dupes.length} duplicate(s):`
  );
  for (const d of dupes) {
    console.log(`  - ${d.id} "${d.name}" (${d._count.items} items, ${d.createdAt.toISOString()})`);
  }

  if (!APPLY) continue;

  await prisma.$transaction(async (tx) => {
    const dupeIds = dupes.map((d) => d.id);
    const items = await tx.collectionItem.findMany({
      where: { collectionId: { in: dupeIds } },
      select: { bookmarkId: true },
      orderBy: { sortOrder: "asc" },
    });

    const maxOrder = await tx.collectionItem.findFirst({
      where: { collectionId: keep.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const baseOrder = (maxOrder?.sortOrder ?? -1) + 1;

    const seen = new Set();
    const toMove = items.filter((i) => {
      if (seen.has(i.bookmarkId)) return false;
      seen.add(i.bookmarkId);
      return true;
    });

    await tx.collectionItem.createMany({
      data: toMove.map((i, index) => ({
        collectionId: keep.id,
        bookmarkId: i.bookmarkId,
        sortOrder: baseOrder + index,
      })),
      skipDuplicates: true,
    });

    await tx.collection.deleteMany({ where: { id: { in: dupeIds } } });
    await tx.collection.update({
      where: { id: keep.id },
      data: { name: "This Week's Gems" },
    });
  });
  console.log(`  merged into ${keep.id}`);
}

if (mergedUsers === 0) {
  console.log("No duplicate gems collections found.");
} else if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to merge.");
}

await prisma.$disconnect();
