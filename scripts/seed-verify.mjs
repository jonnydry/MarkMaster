#!/usr/bin/env node
/**
 * Replace the local verify user, bookmarks, tags, and collection.
 * Tokens are encrypted with the same iv:tag:ciphertext layout as src/lib/encryption.ts
 * so a later decrypt does not throw. The plaintext is not an X credential.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  COLLECTION_BOOKMARK,
  COLLECTION_NAME,
  FEED_BOOKMARK,
  HIGHLIGHTS,
  TAG_DESIGN,
  TAG_RESEARCH,
  VERIFY_DISPLAY_NAME,
  VERIFY_USERNAME,
  VERIFY_XID,
} from "./verify-fixture.mjs";

function encrypt(text) {
  const keyHex = process.env.ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function bookmarkData(row, when) {
  return {
    tweetId: row.tweetId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    authorProfileImage: null,
    authorVerified: false,
    tweetText: row.tweetText,
    publicMetrics: row.metrics,
    media: [],
    urls: [],
    tweetCreatedAt: when,
    bookmarkedAt: when,
    syncedAt: when,
  };
}

const prisma = new PrismaClient();

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  await prisma.user.deleteMany({ where: { xId: VERIFY_XID } });

  const now = new Date();
  const user = await prisma.user.create({
    data: {
      xId: VERIFY_XID,
      username: VERIFY_USERNAME,
      displayName: VERIFY_DISPLAY_NAME,
      profileImageUrl: null,
      accessToken: encrypt("verify-access-token-not-real"),
      refreshToken: encrypt("verify-refresh-token-not-real"),
      tokenExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      tokenRefreshedAt: now,
      lastSyncAt: now,
      syncXFolders: false,
      sessionVersion: 1,
    },
  });

  const design = await prisma.tag.create({
    data: { userId: user.id, name: TAG_DESIGN, color: "#7856ff" },
  });
  const research = await prisma.tag.create({
    data: { userId: user.id, name: TAG_RESEARCH, color: "#1d9bf0" },
  });
  const tagsByName = { [TAG_DESIGN]: design, [TAG_RESEARCH]: research };

  const created = [];
  const rows = [
    ...HIGHLIGHTS.map((row) => ({ row, tag: null, inCollection: false })),
    { row: FEED_BOOKMARK, tag: FEED_BOOKMARK.tag, inCollection: false },
    {
      row: COLLECTION_BOOKMARK,
      tag: COLLECTION_BOOKMARK.tag,
      inCollection: true,
    },
  ];

  for (const [index, item] of rows.entries()) {
    const when = new Date(now.getTime() - index * 60_000);
    const bookmark = await prisma.bookmark.create({
      data: { userId: user.id, ...bookmarkData(item.row, when) },
    });
    if (item.tag) {
      await prisma.bookmarkTag.create({
        data: { bookmarkId: bookmark.id, tagId: tagsByName[item.tag].id },
      });
    }
    created.push({ bookmark, inCollection: item.inCollection });
  }

  const collectionBookmark = created.find((item) => item.inCollection);
  await prisma.collection.create({
    data: {
      userId: user.id,
      name: COLLECTION_NAME,
      description: "Seeded for local verification.",
      type: "user_collection",
      isPublic: false,
      items: {
        create: [{ bookmarkId: collectionBookmark.bookmark.id, sortOrder: 0 }],
      },
    },
  });

  const fresh = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true,
      xId: true,
      username: true,
      displayName: true,
      profileImageUrl: true,
      lastSyncAt: true,
      syncXFolders: true,
      sessionVersion: true,
    },
  });

  process.stdout.write(
    `${JSON.stringify({
      id: fresh.id,
      xId: fresh.xId,
      username: fresh.username,
      displayName: fresh.displayName,
      profileImageUrl: fresh.profileImageUrl,
      lastSyncAt: fresh.lastSyncAt.toISOString(),
      syncXFolders: fresh.syncXFolders,
      sessionVersion: fresh.sessionVersion,
    })}\n`
  );
} finally {
  await prisma.$disconnect();
}
