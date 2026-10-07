import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

type BookmarkRow = {
  id: string;
  userId: string;
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorVerified: boolean;
  tweetText: string;
  publicMetrics: null;
  media: null;
  urls: unknown[];
  quotedTweet: null;
  tweetCreatedAt: Date;
  bookmarkedAt: Date;
  notes: [];
  collectionItems: [];
};

type TagRow = { id: string; userId: string; name: string; color: string };
type JoinRow = { bookmarkId: string; tagId: string };
type ProposalRow = {
  id: string;
  auditId: string;
  bookmarkId: string;
  tagId: string;
  kind: string;
  swapTagId: string | null;
  reason: string;
  currentScore: number;
  rank: number;
};
type UndoDelta = {
  removes: Array<{ bookmarkId: string; tagId: string }>;
  adds: Array<{ bookmarkId: string; tagId: string }>;
};
type UndoRow = {
  auditId: string;
  userId: string;
  joins: UndoDelta;
  createdAt: Date;
  restoredAt: Date | null;
};
type AuditRow = {
  id: string;
  userId: string;
  phase: string;
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  outcome: { appliedProposalIds: string[]; skippedProposalIds: string[] } | null;
  appliedAt: Date | null;
  createdAt: Date;
};

const memory = vi.hoisted(() => {
  const bookmarks: BookmarkRow[] = [];
  const tags: TagRow[] = [];
  const joins: JoinRow[] = [];
  const audits: AuditRow[] = [];
  const proposals: ProposalRow[] = [];
  const undos: UndoRow[] = [];
  const events: Array<Record<string, unknown>> = [];
  let clock = Date.now();

  function nextTick() {
    clock = Math.max(Date.now(), clock + 1);
    return new Date(clock);
  }

  function reset() {
    bookmarks.length = 0;
    tags.length = 0;
    joins.length = 0;
    audits.length = 0;
    proposals.length = 0;
    undos.length = 0;
    events.length = 0;
    createMany.mockClear();
  }

  function deleteTag(tagId: string) {
    for (let index = tags.length - 1; index >= 0; index -= 1) {
      if (tags[index]?.id === tagId) tags.splice(index, 1);
    }
  }

  function addJoin(bookmarkId: string, tagId: string) {
    joins.push({ bookmarkId, tagId });
  }

  function removeJoin(bookmarkId: string, tagId: string) {
    for (let index = joins.length - 1; index >= 0; index -= 1) {
      const join = joins[index];
      if (join?.bookmarkId === bookmarkId && join.tagId === tagId) joins.splice(index, 1);
    }
  }

  function snapshotMemory() {
    return {
      bookmarks: bookmarks.map((row) => ({ ...row })),
      tags: tags.map((row) => ({ ...row })),
      joins: joins.map((row) => ({ ...row })),
      audits: audits.map((row) => ({ ...row })),
      proposals: proposals.map((row) => ({ ...row })),
      undos: undos.map((row) => ({ ...row, joins: structuredClone(row.joins) })),
      events: events.map((row) => ({ ...row })),
    };
  }

  function restoreMemory(saved: ReturnType<typeof snapshotMemory>) {
    bookmarks.splice(0, bookmarks.length, ...saved.bookmarks);
    tags.splice(0, tags.length, ...saved.tags);
    joins.splice(0, joins.length, ...saved.joins);
    audits.splice(0, audits.length, ...saved.audits);
    proposals.splice(0, proposals.length, ...saved.proposals);
    undos.splice(0, undos.length, ...saved.undos);
    events.splice(0, events.length, ...saved.events);
  }
  function tagIds(bookmarkId: string) {
    return joins
      .filter((join) => join.bookmarkId === bookmarkId)
      .map((join) => join.tagId)
      .sort();
  }

  function bookmarkMatches(bookmark: BookmarkRow, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    if (typeof where.userId === "string" && bookmark.userId !== where.userId) return false;
    const idFilter = where.id as { in?: string[]; notIn?: string[]; lt?: string } | undefined;
    if (idFilter?.in && !idFilter.in.includes(bookmark.id)) return false;
    if (idFilter?.notIn && idFilter.notIn.includes(bookmark.id)) return false;
    if (idFilter?.lt && bookmark.id >= idFilter.lt) return false;
    const bookmarkedAt = where.bookmarkedAt as Date | { lt?: Date } | undefined;
    if (bookmarkedAt instanceof Date) {
      if (bookmark.bookmarkedAt.getTime() !== bookmarkedAt.getTime()) return false;
    } else if (bookmarkedAt?.lt && bookmark.bookmarkedAt >= bookmarkedAt.lt) {
      return false;
    }
    if (where.tags && typeof where.tags === "object") {
      const tagged = joins.some((join) => join.bookmarkId === bookmark.id);
      if (!tagged) return false;
    }
    if (Array.isArray(where.AND)) {
      if (!where.AND.every((part) => bookmarkMatches(bookmark, part as Record<string, unknown>))) {
        return false;
      }
    }
    if (Array.isArray(where.OR)) {
      if (!where.OR.some((part) => bookmarkMatches(bookmark, part as Record<string, unknown>))) {
        return false;
      }
    }
    return true;
  }

  function withTags(bookmark: BookmarkRow) {
    return {
      ...bookmark,
      tags: joins
        .filter((join) => join.bookmarkId === bookmark.id)
        .map((join) => ({
          tagId: join.tagId,
          tag: tags.find((tag) => tag.id === join.tagId) ?? null,
        })),
      notes: [],
      collectionItems: [],
    };
  }

  function pick<T extends Record<string, unknown>>(row: T, select: Record<string, boolean> | undefined) {
    if (!select) return row;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) picked[key] = row[key];
    }
    return picked;
  }

  const createMany = vi.fn(async (args: { data: Array<Record<string, unknown>> | Record<string, unknown> }) => {
    const rows = Array.isArray(args.data) ? args.data : [args.data];
    for (const row of rows) events.push({ ...row, createdAt: new Date() });
    return { count: rows.length };
  });

  const prisma = {
    bookmark: {
      async count(args: { where?: Record<string, unknown> }) {
        return bookmarks.filter((bookmark) => bookmarkMatches(bookmark, args.where)).length;
      },
      async findMany(args: {
        where?: Record<string, unknown>;
        orderBy?: Array<Record<string, "asc" | "desc">>;
        take?: number;
        include?: unknown;
        select?: Record<string, boolean>;
      }) {
        let rows = bookmarks.filter((bookmark) => bookmarkMatches(bookmark, args.where));
        if (args.orderBy) {
          rows = [...rows].sort((left, right) => {
            for (const key of args.orderBy ?? []) {
              const field = Object.keys(key)[0] as keyof BookmarkRow;
              const dir = key[field as string];
              const av = left[field];
              const bv = right[field];
              if (av < bv) return dir === "desc" ? 1 : -1;
              if (av > bv) return dir === "desc" ? -1 : 1;
            }
            return 0;
          });
        }
        if (typeof args.take === "number") rows = rows.slice(0, args.take);
        return rows.map((bookmark) => {
          const full = args.include ? withTags(bookmark) : bookmark;
          return pick(full as unknown as Record<string, unknown>, args.select);
        });
      },
    },
    tag: {
      async findMany(args: { where?: { userId?: string; id?: { in?: string[] } }; select?: Record<string, boolean> }) {
        const rows = tags.filter((tag) => {
          if (args.where?.userId && tag.userId !== args.where.userId) return false;
          if (args.where?.id?.in && !args.where.id.in.includes(tag.id)) return false;
          return true;
        });
        return rows.map((tag) => pick(tag as unknown as Record<string, unknown>, args.select));
      },
    },
    bookmarkTag: {
      async findMany(args: {
        where?: { bookmarkId?: { in?: string[] }; bookmark?: { userId?: string } };
        select?: Record<string, boolean>;
      }) {
        const rows = joins.filter((join) => {
          if (args.where?.bookmarkId?.in && !args.where.bookmarkId.in.includes(join.bookmarkId)) {
            return false;
          }
          if (args.where?.bookmark?.userId) {
            const bookmark = bookmarks.find((item) => item.id === join.bookmarkId);
            if (!bookmark || bookmark.userId !== args.where.bookmark.userId) return false;
          }
          return true;
        });
        return rows.map((join) => pick(join as unknown as Record<string, unknown>, args.select));
      },
      async deleteMany(args: {
        where?: { bookmarkId?: { in?: string[] }; OR?: Array<{ bookmarkId: string; tagId: string }> };
      }) {
        const before = joins.length;
        for (let index = joins.length - 1; index >= 0; index -= 1) {
          const join = joins[index];
          if (!join) continue;
          const inList = args.where?.bookmarkId?.in?.includes(join.bookmarkId);
          const inOr = args.where?.OR?.some(
            (pair) => pair.bookmarkId === join.bookmarkId && pair.tagId === join.tagId,
          );
          if (inList || inOr) joins.splice(index, 1);
        }
        return { count: before - joins.length };
      },
      async createMany(args: { data: JoinRow[]; skipDuplicates?: boolean }) {
        let count = 0;
        for (const row of args.data) {
          const exists = joins.some(
            (join) => join.bookmarkId === row.bookmarkId && join.tagId === row.tagId,
          );
          if (exists && args.skipDuplicates) continue;
          joins.push({ bookmarkId: row.bookmarkId, tagId: row.tagId });
          count += 1;
        }
        return { count };
      },
    },
    orbitTagAudit: {
      async findFirst(args: {
        where?: {
          id?: string;
          userId?: string;
          phase?: string;
          undo?: { is?: { restoredAt?: Date | null } };
        };
        orderBy?: { createdAt?: "asc" | "desc"; appliedAt?: "asc" | "desc" };
        include?: { proposals?: unknown; undo?: boolean };
      }) {
        let rows = audits.filter((audit) => {
          if (args.where?.id && audit.id !== args.where.id) return false;
          if (args.where?.userId && audit.userId !== args.where.userId) return false;
          if (args.where?.phase && audit.phase !== args.where.phase) return false;
          if (args.where?.undo?.is && "restoredAt" in args.where.undo.is) {
            const undo = undos.find((item) => item.auditId === audit.id);
            if (!undo || undo.restoredAt !== args.where.undo.is.restoredAt) return false;
          }
          return true;
        });
        if (args.orderBy?.appliedAt === "desc") {
          rows = [...rows].sort(
            (left, right) => (right.appliedAt?.getTime() ?? 0) - (left.appliedAt?.getTime() ?? 0),
          );
        } else if (args.orderBy?.createdAt === "desc") {
          rows = [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        }
        const audit = rows[0];
        if (!audit) return null;
        return {
          ...audit,
          proposals: proposals
            .filter((proposal) => proposal.auditId === audit.id)
            .sort((left, right) => left.rank - right.rank),
          undo: undos.find((undo) => undo.auditId === audit.id) ?? null,
        };
      },
      async create(args: {
        data: Omit<AuditRow, "createdAt" | "appliedAt" | "outcome"> & {
          createdAt?: Date;
          appliedAt?: Date | null;
          outcome?: AuditRow["outcome"];
          proposals?: { create?: Array<Omit<ProposalRow, "auditId">> };
        };
      }) {
        const audit: AuditRow = {
          id: args.data.id,
          userId: args.data.userId,
          phase: args.data.phase,
          taggedBookmarkCount: args.data.taggedBookmarkCount,
          judgedBookmarkCount: args.data.judgedBookmarkCount,
          outcome: args.data.outcome ?? null,
          appliedAt: args.data.appliedAt ?? null,
          createdAt: args.data.createdAt ?? nextTick(),
        };
        audits.push(audit);
        for (const proposal of args.data.proposals?.create ?? []) {
          proposals.push({ ...proposal, auditId: audit.id });
        }
        return audit;
      },
      async update(args: { where: { id: string }; data: Partial<AuditRow> }) {
        const audit = audits.find((item) => item.id === args.where.id);
        if (!audit) throw new Error(`missing audit ${args.where.id}`);
        const data = { ...args.data };
        if (data.outcome === Prisma.DbNull) data.outcome = null;
        Object.assign(audit, data);
        return audit;
      },
      async deleteMany(args: { where: { userId: string; phase: string } }) {
        const removed = audits.filter(
          (audit) => audit.userId === args.where.userId && audit.phase === args.where.phase,
        );
        const ids = new Set(removed.map((audit) => audit.id));
        for (let index = audits.length - 1; index >= 0; index -= 1) {
          if (audits[index] && ids.has(audits[index].id)) audits.splice(index, 1);
        }
        for (let index = proposals.length - 1; index >= 0; index -= 1) {
          if (proposals[index] && ids.has(proposals[index].auditId)) proposals.splice(index, 1);
        }
        for (let index = undos.length - 1; index >= 0; index -= 1) {
          if (undos[index] && ids.has(undos[index].auditId)) undos.splice(index, 1);
        }
        return { count: removed.length };
      },
    },
    orbitTagAuditUndo: {
      async create(args: { data: Omit<UndoRow, "createdAt" | "restoredAt"> & { createdAt?: Date } }) {
        const undo: UndoRow = {
          auditId: args.data.auditId,
          userId: args.data.userId,
          joins: args.data.joins,
          createdAt: args.data.createdAt ?? new Date(),
          restoredAt: null,
        };
        undos.push(undo);
        return undo;
      },
      async update(args: { where: { auditId: string }; data: { restoredAt?: Date } }) {
        const undo = undos.find((item) => item.auditId === args.where.auditId);
        if (!undo) throw new Error(`missing undo ${args.where.auditId}`);
        Object.assign(undo, args.data);
        return undo;
      },
    },
    orbitDecisionEvent: {
      createMany,
      async findMany(args: {
        where?: {
          userId?: string;
          action?: string;
          source?: string;
          createdAt?: { gte?: Date };
          bookmarkId?: { in?: string[] };
        };
        select?: { originalSuggestion?: boolean; bookmark?: unknown };
      }) {
        if (!args.select?.originalSuggestion) return [];
        return events
          .filter((event) => {
            if (args.where?.userId && event.userId !== args.where.userId) return false;
            if (args.where?.action && event.action !== args.where.action) return false;
            if (args.where?.source && event.source !== args.where.source) return false;
            if (args.where?.bookmarkId?.in && !args.where.bookmarkId.in.includes(String(event.bookmarkId))) {
              return false;
            }
            const createdAt = event.createdAt;
            if (args.where?.createdAt?.gte && (!(createdAt instanceof Date) || createdAt < args.where.createdAt.gte)) {
              return false;
            }
            return true;
          })
          .map((event) => {
            if (!args.select?.bookmark) return event;
            const bookmark = bookmarks.find((item) => item.id === event.bookmarkId);
            return {
              ...event,
              bookmark: {
                authorUsername: bookmark?.authorUsername ?? "reader",
                tweetText: bookmark?.tweetText ?? "",
                media: bookmark?.media ?? null,
                urls: bookmark?.urls ?? [],
                xMetadata: null,
                collectionItems: [],
              },
            };
          });
      },
      async deleteMany(args: {
        where?: {
          userId?: string;
          source?: string;
          createdAt?: { gte?: Date };
          bookmarkId?: { in?: string[] };
          originalSuggestion?: { path?: string[]; equals?: string };
        };
      }) {
        const before = events.length;
        for (let index = events.length - 1; index >= 0; index -= 1) {
          const event = events[index];
          if (!event) continue;
          if (args.where?.userId && event.userId !== args.where.userId) continue;
          if (args.where?.source && event.source !== args.where.source) continue;
          if (
            args.where?.bookmarkId?.in &&
            !args.where.bookmarkId.in.includes(String(event.bookmarkId))
          ) {
            continue;
          }
          const auditEquals = args.where?.originalSuggestion;
          if (auditEquals?.path?.[0] === "auditId") {
            const suggestion = event.originalSuggestion;
            const auditId =
              suggestion && typeof suggestion === "object"
                ? (suggestion as { auditId?: unknown }).auditId
                : undefined;
            if (auditId !== auditEquals.equals) continue;
          }
          const createdAt = event.createdAt;
          if (
            args.where?.createdAt?.gte &&
            (!(createdAt instanceof Date) || createdAt < args.where.createdAt.gte)
          ) {
            continue;
          }
          events.splice(index, 1);
        }
        return { count: before - events.length };
      },
    },
    async $executeRaw() {
      return 1;
    },
    async $queryRaw() {
      return [];
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
      const saved = snapshotMemory();
      try {
        return await fn(prisma);
      } catch (error) {
        restoreMemory(saved);
        throw error;
      }
    },
  };

  function seedTag(tag: TagRow) {
    tags.push(tag);
  }

  function seedBookmark(args: {
    id: string;
    userId?: string;
    tweetText?: string;
    bookmarkedAt?: Date;
    tagIds: string[];
  }) {
    bookmarks.push({
      id: args.id,
      userId: args.userId ?? "user-1",
      tweetId: args.id,
      authorId: "author-1",
      authorUsername: "reader",
      authorDisplayName: "Reader",
      authorVerified: false,
      tweetText: args.tweetText ?? "A saved note about the post.",
      publicMetrics: null,
      media: null,
      urls: [],
      quotedTweet: null,
      tweetCreatedAt: args.bookmarkedAt ?? new Date("2026-01-01T00:00:00.000Z"),
      bookmarkedAt: args.bookmarkedAt ?? new Date("2026-01-02T00:00:00.000Z"),
      notes: [],
      collectionItems: [],
    });
    for (const tagId of args.tagIds) joins.push({ bookmarkId: args.id, tagId });
  }

  function seedOpenAudit(args: {
    id: string;
    userId?: string;
    phase?: string;
    proposals: Array<Omit<ProposalRow, "auditId">>;
  }) {
    audits.push({
      id: args.id,
      userId: args.userId ?? "user-1",
      phase: args.phase ?? "open",
      taggedBookmarkCount: 1,
      judgedBookmarkCount: 1,
      outcome: null,
      appliedAt: null,
      createdAt: new Date(),
    });
    for (const proposal of args.proposals) {
      proposals.push({ ...proposal, auditId: args.id });
    }
  }

  return {
    prisma,
    reset,
    tagIds,
    seedTag,
    seedBookmark,
    seedOpenAudit,
    undos,
    events,
    createMany,
    addJoin,
    removeJoin,
    deleteTag,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: memory.prisma }));

const systemOneMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/typesafe", () => ({
  getTypeSafeClient: () => ({ systemOne: systemOneMock }),
  getTypeSafeModel: () => "jev-latest",
  getTypeSafeModelSource: () => "default",
  isTypeSafeConfigured: () => Boolean(process.env.TYPESAFE_API_KEY?.trim()),
  TYPESAFE_TIMEOUT_MS: 15_000,
}));

import {
  applyOrbitTagAudit,
  readOrbitTagAudit,
  runOrbitTagAudit,
  tagAuditCoverageSentence,
  tagAuditGrokTimeoutMs,
  undoOrbitTagAudit,
} from "@/lib/orbit-tag-audit";

const fetchMock = vi.fn();

function pairKeysFromBody(body: string): string[] {
  const parsed = JSON.parse(body) as {
    input?: Array<{ role?: string; content?: unknown }>;
  };
  const user = parsed.input?.find((item) => item.role === "user");
  const content =
    typeof user?.content === "string" ? JSON.parse(user.content) : user?.content;
  const found: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "pairKey" && typeof child === "string") found.push(child);
      else walk(child);
    }
  };
  walk(content);
  return found;
}

function grokResponse(verdicts: Array<{ pairKey: string; agree: boolean; reason: string }>) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ verdicts }) }],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function agreeAll(_url: string, init?: RequestInit) {
  const keys = pairKeysFromBody(String(init?.body ?? ""));
  return grokResponse(
    keys.map((pairKey) => ({
      pairKey,
      agree: true,
      reason: "This correction is right.",
    })),
  );
}

function answerByName(
  scoresByBookmark: Record<string, Record<string, number>>,
) {
  systemOneMock.mockImplementation(async (request: {
    state: { id: string };
    questions: Record<string, { instructions?: string }>;
  }) => {
    const scores = scoresByBookmark[request.state.id] ?? {};
    const answers: Record<string, { noul: number }> = {};
    for (const [key, question] of Object.entries(request.questions)) {
      const name = question.instructions?.match(/tag "([^"]+)"/)?.[1];
      answers[key] = { noul: name && name in scores ? scores[name]! : 0 };
    }
    return { answers };
  });
}

describe("orbit tag audit", () => {
  beforeEach(() => {
    memory.reset();
    systemOneMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(agreeAll);
    vi.stubGlobal("fetch", fetchMock);
    process.env.TYPESAFE_API_KEY = "test-typesafe";
    process.env.XAI_API_KEY = "test-xai";
  });

  it("removes a weak tag, swaps a beaten tag, and keeps a close or strong tag", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedTag({ id: "tag-okay", userId: "user-1", name: "Okay", color: "#222222" });
    memory.seedTag({ id: "tag-fine", userId: "user-1", name: "Fine", color: "#333333" });
    memory.seedTag({ id: "tag-solid", userId: "user-1", name: "Solid", color: "#444444" });
    memory.seedTag({ id: "tag-better", userId: "user-1", name: "Better", color: "#2255aa" });
    memory.seedTag({ id: "tag-close", userId: "user-1", name: "Close", color: "#555555" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"], bookmarkedAt: new Date("2026-04-04T00:00:00.000Z") });
    memory.seedBookmark({ id: "bm-okay", tagIds: ["tag-okay"], bookmarkedAt: new Date("2026-04-03T00:00:00.000Z") });
    memory.seedBookmark({ id: "bm-fine", tagIds: ["tag-fine"], bookmarkedAt: new Date("2026-04-02T00:00:00.000Z") });
    memory.seedBookmark({ id: "bm-solid", tagIds: ["tag-solid"], bookmarkedAt: new Date("2026-04-01T00:00:00.000Z") });

    const quiet = { Loose: 0.1, Okay: 0.1, Fine: 0.1, Solid: 0.1, Better: 0.1, Close: 0.1 };
    answerByName({
      "bm-loose": { ...quiet, Loose: 0.2, Better: 0.3 },
      "bm-okay": { ...quiet, Okay: 0.4, Better: 0.9 },
      "bm-fine": { ...quiet, Fine: 0.7, Close: 0.85 },
      "bm-solid": { ...quiet, Solid: 0.9 },
    });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });

    expect(
      view.proposals.map((proposal) => ({
        bookmarkId: proposal.bookmarkId,
        tag: proposal.currentTag.name,
        suggestion:
          proposal.suggestion.kind === "remove"
            ? "Remove"
            : `Swap to ${proposal.suggestion.name}`,
        swapTagId: proposal.suggestion.kind === "swap" ? proposal.suggestion.tagId : null,
      })),
    ).toEqual([
      { bookmarkId: "bm-loose", tag: "Loose", suggestion: "Remove", swapTagId: null },
      {
        bookmarkId: "bm-okay",
        tag: "Okay",
        suggestion: "Swap to Better",
        swapTagId: "tag-better",
      },
    ]);
  });

  it("sends 24 pair keys to Grok and keeps only the agreed ones", async () => {
    for (let index = 1; index <= 30; index += 1) {
      const suffix = String(index).padStart(2, "0");
      memory.seedTag({
        id: `t-${suffix}`,
        userId: "user-1",
        name: `Weak ${suffix}`,
        color: "#111111",
      });
      memory.seedBookmark({
        id: `b-${suffix}`,
        tagIds: [`t-${suffix}`],
        bookmarkedAt: new Date(Date.UTC(2026, 0, index)),
      });
    }
    systemOneMock.mockImplementation(async (request: { questions: Record<string, unknown> }) => {
      const answers: Record<string, { noul: number }> = {};
      for (const key of Object.keys(request.questions)) answers[key] = { noul: 0.2 };
      return { answers };
    });
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const keys = pairKeysFromBody(String(init?.body ?? ""));
      return grokResponse(
        keys.map((pairKey, index) => ({
          pairKey,
          agree: index !== 0,
          reason: index === 0 ? "No." : "Yes.",
        })),
      );
    });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });

    const sent = pairKeysFromBody(String(fetchMock.mock.calls[0]?.[1]?.body ?? ""));
    const vetoed = sent[0];
    expect(sent).toHaveLength(24);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      view.proposals.map((proposal) => `${proposal.bookmarkId}:${proposal.currentTag.id}`).sort(),
    ).toEqual(sent.filter((pairKey) => pairKey !== vetoed).sort());
    expect(view.proposals.some((proposal) => `${proposal.bookmarkId}:${proposal.currentTag.id}` === vetoed)).toBe(false);
  });

  it("applies only the checked bookmark and leaves the unchecked tag in place", async () => {
    memory.seedTag({ id: "tag-one", userId: "user-1", name: "One", color: "#111111" });
    memory.seedTag({ id: "tag-two", userId: "user-1", name: "Two", color: "#222222" });
    memory.seedBookmark({ id: "bm-one", tagIds: ["tag-one"], bookmarkedAt: new Date("2026-05-02T00:00:00.000Z") });
    memory.seedBookmark({ id: "bm-two", tagIds: ["tag-two"], bookmarkedAt: new Date("2026-05-01T00:00:00.000Z") });
    answerByName({
      "bm-one": { One: 0.2, Two: 0.1 },
      "bm-two": { Two: 0.2, One: 0.1 },
    });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    const checked = view.proposals.find((proposal) => proposal.bookmarkId === "bm-one");
    expect(checked).toBeDefined();

    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: view.auditId,
      checkedProposalIds: [checked!.id],
    });

    expect(memory.tagIds("bm-one")).toEqual([]);
    expect(memory.tagIds("bm-two")).toEqual(["tag-two"]);
  });

  it("undo puts back a removed tag, keeps a tag added later, and does not restore a tag deleted later", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedTag({ id: "tag-other", userId: "user-1", name: "Other", color: "#222222" });
    memory.seedTag({ id: "tag-later", userId: "user-1", name: "Later", color: "#333333" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose", "tag-other"] });
    answerByName({ "bm-loose": { Loose: 0.2, Other: 0.9, Later: 0.1 } });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: view.auditId,
      checkedProposalIds: view.proposals.map((proposal) => proposal.id),
    });
    expect(memory.tagIds("bm-loose")).toEqual(["tag-other"]);
    memory.removeJoin("bm-loose", "tag-other");
    memory.addJoin("bm-loose", "tag-later");

    const undone = await undoOrbitTagAudit({ userId: "user-1", auditId: view.auditId });
    expect(undone.alreadyUndone).toBe(false);
    expect(memory.tagIds("bm-loose")).toEqual(["tag-later", "tag-loose"]);

    const second = await undoOrbitTagAudit({ userId: "user-1", auditId: view.auditId });
    expect(second.alreadyUndone).toBe(true);
    expect(memory.tagIds("bm-loose")).toEqual(["tag-later", "tag-loose"]);
  });

  it("undo skips a deleted tag instead of failing", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    answerByName({ "bm-loose": { Loose: 0.2 } });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: view.auditId,
      checkedProposalIds: view.proposals.map((proposal) => proposal.id),
    });
    memory.deleteTag("tag-loose");

    const undone = await undoOrbitTagAudit({ userId: "user-1", auditId: view.auditId });
    expect(undone.alreadyUndone).toBe(false);
    expect(memory.tagIds("bm-loose")).toEqual([]);
  });

  it("undo deletes tag-audit rejections for the bookmarks it restores", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    answerByName({ "bm-loose": { Loose: 0.2 } });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: view.auditId,
      checkedProposalIds: view.proposals.map((proposal) => proposal.id),
    });
    memory.events.push({
      userId: "user-1",
      bookmarkId: "bm-other",
      action: "rejected",
      source: "tag-audit",
      createdAt: new Date(),
    });
    expect(memory.events.some((event) => event.bookmarkId === "bm-loose")).toBe(true);

    await undoOrbitTagAudit({ userId: "user-1", auditId: view.auditId });
    expect(memory.events.map((event) => event.bookmarkId)).toEqual(["bm-other"]);
  });

  it("rolls the apply back when the decision log write fails", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    answerByName({ "bm-loose": { Loose: 0.2 } });
    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    memory.createMany.mockImplementationOnce(async () => {
      throw new Error("decision log failed");
    });

    await expect(
      applyOrbitTagAudit({
        userId: "user-1",
        auditId: view.auditId,
        checkedProposalIds: view.proposals.map((proposal) => proposal.id),
      }),
    ).rejects.toThrow("decision log failed");
    expect(memory.tagIds("bm-loose")).toEqual(["tag-loose"]);
    expect(memory.undos).toEqual([]);
    expect(memory.events).toEqual([]);
  });

  it("does not count a failed Jev call as reviewed", async () => {
    memory.seedTag({ id: "tag-one", userId: "user-1", name: "One", color: "#111111" });
    memory.seedTag({ id: "tag-two", userId: "user-1", name: "Two", color: "#222222" });
    memory.seedBookmark({ id: "bm-one", tagIds: ["tag-one"], bookmarkedAt: new Date("2026-06-02T00:00:00.000Z") });
    memory.seedBookmark({ id: "bm-two", tagIds: ["tag-two"], bookmarkedAt: new Date("2026-06-01T00:00:00.000Z") });
    systemOneMock.mockImplementation(async (request: { state: { id: string } }) => {
      if (request.state.id === "bm-one") throw new Error("jev down");
      return { answers: { current_0: { noul: 0.2 }, rival_0: { noul: 0.1 } } };
    });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });

    expect(view.coverage.judgedBookmarkCount).toBe(1);
    expect(view.coverage.taggedBookmarkCount).toBe(2);
    expect(view.proposals.map((proposal) => proposal.bookmarkId)).toEqual(["bm-two"]);
  });

  it("writes one rejected event whose original suggestion lists only the old tag", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    answerByName({ "bm-loose": { Loose: 0.2 } });

    const view = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: view.auditId,
      checkedProposalIds: view.proposals.map((proposal) => proposal.id),
    });

    const written = memory.createMany.mock.calls.map((call) => call[0].data).flat();
    expect(
      written.map((event) => ({
        action: event.action,
        tags: (event.originalSuggestion as { tags: Array<{ name: string }> }).tags.map(
          (tag) => tag.name,
        ),
      })),
    ).toEqual([{ action: "rejected", tags: ["Loose"] }]);
    expect(
      (written[0]?.originalSuggestion as { tags: unknown[] }).tags,
    ).toHaveLength(1);
  });

  it("drops swap target B when the same bookmark also removes B", async () => {
    memory.seedTag({ id: "tag-a", userId: "user-1", name: "A", color: "#112233" });
    memory.seedTag({ id: "tag-b", userId: "user-1", name: "B", color: "#445566" });
    memory.seedBookmark({ id: "bm-ab", tagIds: ["tag-a", "tag-b"] });
    memory.seedOpenAudit({
      id: "audit-ab",
      proposals: [
        {
          id: "p-remove",
          bookmarkId: "bm-ab",
          tagId: "tag-b",
          kind: "remove",
          swapTagId: null,
          reason: "B is a weak match for this post.",
          currentScore: 0.2,
          rank: 0,
        },
        {
          id: "p-swap",
          bookmarkId: "bm-ab",
          tagId: "tag-a",
          kind: "swap",
          swapTagId: "tag-b",
          reason: "B fits this post better than A.",
          currentScore: 0.4,
          rank: 1,
        },
      ],
    });

    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: "audit-ab",
      checkedProposalIds: ["p-remove", "p-swap"],
    });

    expect(memory.tagIds("bm-ab")).toEqual([]);
  });

  it("undo of an older audit leaves a newer audit's rejection events", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    answerByName({ "bm-loose": { Loose: 0.2 } });

    const older = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: older.auditId,
      checkedProposalIds: older.proposals.map((proposal) => proposal.id),
    });
    memory.addJoin("bm-loose", "tag-loose");
    const newer = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: newer.auditId,
      checkedProposalIds: newer.proposals.map((proposal) => proposal.id),
    });
    const onBookmark = () =>
      memory.events.filter((event) => event.bookmarkId === "bm-loose" && event.source === "tag-audit");
    expect(onBookmark()).toHaveLength(2);

    await undoOrbitTagAudit({ userId: "user-1", auditId: older.auditId });

    const remaining = onBookmark();
    expect(remaining).toHaveLength(1);
    expect((remaining[0]?.originalSuggestion as { auditId?: string } | undefined)?.auditId).toBe(
      newer.auditId,
    );
  });

  it("does not remove a tag when the proposal kind or the audit phase is unknown", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-kind", tagIds: ["tag-loose"] });
    memory.seedBookmark({ id: "bm-phase", tagIds: ["tag-loose"] });
    memory.seedOpenAudit({
      id: "audit-kind",
      proposals: [
        {
          id: "p-kind",
          bookmarkId: "bm-kind",
          tagId: "tag-loose",
          kind: "explode",
          swapTagId: null,
          reason: "Unknown action.",
          currentScore: 0.2,
          rank: 0,
        },
      ],
    });
    memory.seedOpenAudit({
      id: "audit-phase",
      phase: "retired",
      proposals: [
        {
          id: "p-phase",
          bookmarkId: "bm-phase",
          tagId: "tag-loose",
          kind: "remove",
          swapTagId: null,
          reason: "Loose is a weak match for this post.",
          currentScore: 0.2,
          rank: 0,
        },
      ],
    });

    try {
      await applyOrbitTagAudit({
        userId: "user-1",
        auditId: "audit-kind",
        checkedProposalIds: ["p-kind"],
      });
    } catch {
      // Fail closed may throw instead of skipping.
    }
    try {
      await applyOrbitTagAudit({
        userId: "user-1",
        auditId: "audit-phase",
        checkedProposalIds: ["p-phase"],
      });
    } catch {
      // Fail closed may throw instead of skipping.
    }

    expect(memory.tagIds("bm-kind")).toEqual(["tag-loose"]);
    expect(memory.tagIds("bm-phase")).toEqual(["tag-loose"]);
  });

  it("keeps the last apply undo available after review again", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    answerByName({ "bm-loose": { Loose: 0.2 } });

    const applied = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    await applyOrbitTagAudit({
      userId: "user-1",
      auditId: applied.auditId,
      checkedProposalIds: applied.proposals.map((proposal) => proposal.id),
    });
    expect(memory.tagIds("bm-loose")).toEqual([]);

    const again = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    const loaded = await readOrbitTagAudit({ userId: "user-1" });

    const againUndoId = (again as { undoAuditId?: string }).undoAuditId;
    const loadedUndoId = (loaded as { undoAuditId?: string } | null)?.undoAuditId;
    expect(again.phase).toBe("open");
    expect(again.undoAvailable).toBe(true);
    expect(againUndoId).toBe(applied.auditId);
    expect(loaded?.undoAvailable).toBe(true);
    expect(loadedUndoId).toBe(applied.auditId);

    await undoOrbitTagAudit({ userId: "user-1", auditId: againUndoId! });
    expect(memory.tagIds("bm-loose")).toEqual(["tag-loose"]);
  });

  it("aborts in-flight Jev calls when the audit deadline leaves only the Grok window", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    memory.seedBookmark({ id: "bm-loose", tagIds: ["tag-loose"] });
    let signal: AbortSignal | undefined;
    systemOneMock.mockImplementation(
      (_request: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const view = await Promise.race([
      runOrbitTagAudit({
        userId: "user-1",
        deadlineMs: Date.now() + 60_000 + 15_000 + 40,
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("signal did not abort Jev")), 500);
      }),
    ]);

    expect(signal?.aborted).toBe(true);
    expect(view.coverage.judgedBookmarkCount).toBe(0);
    expect(tagAuditGrokTimeoutMs(10_000, 0)).toBe(10_000);
    expect(tagAuditGrokTimeoutMs(90_000, 0)).toBe(60_000);
  });

  it("reviews the next page of tagged bookmarks and then wraps to the newest", async () => {
    memory.seedTag({ id: "tag-loose", userId: "user-1", name: "Loose", color: "#111111" });
    const total = 161;
    for (let index = 0; index < total; index += 1) {
      const suffix = String(index).padStart(3, "0");
      memory.seedBookmark({
        id: `bm-${suffix}`,
        tagIds: ["tag-loose"],
        bookmarkedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000),
      });
    }
    const judgedIds: string[] = [];
    systemOneMock.mockImplementation(async (request: { state: { id: string } }) => {
      judgedIds.push(request.state.id);
      return { answers: { current_0: { noul: 0.9 } } };
    });

    const first = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    const firstIds = judgedIds.splice(0, judgedIds.length);
    const second = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    const secondIds = judgedIds.splice(0, judgedIds.length);
    const third = await runOrbitTagAudit({
      userId: "user-1",
      deadlineMs: Date.now() + 600_000,
    });
    const thirdIds = judgedIds.splice(0, judgedIds.length);

    expect(new Set(firstIds)).toEqual(new Set(Array.from({ length: 80 }, (_item, index) => {
      return `bm-${String(total - 1 - index).padStart(3, "0")}`;
    })));
    expect(new Set(secondIds).size).toBe(80);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    expect(thirdIds).toContain("bm-000");
    expect(thirdIds.some((id) => firstIds.includes(id))).toBe(true);
    expect(tagAuditCoverageSentence(first.coverage)).toBe(
      "Reviewed the newest 80 of 161 tagged bookmarks.",
    );
    expect(tagAuditCoverageSentence(second.coverage)).toMatch(/continuing/);
    expect(tagAuditCoverageSentence(third.coverage)).toMatch(/wrapping/);
  });
});
