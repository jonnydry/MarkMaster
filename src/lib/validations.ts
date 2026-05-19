import { z } from "zod";

export const MAX_BOOKMARK_TARGETS = 100;
export const MAX_REORDER_ITEMS = 500;
export const MAX_BOOKMARK_QUERY_PAGE = 500;
export const MAX_BOOKMARK_QUERY_LENGTH = 240;
export const MAX_BOOKMARK_FILTER_LENGTH = 120;
export const MAX_TAG_FILTER_IDS = 100;

const booleanQueryFlagSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const idSchema = z.string().trim().min(1, "ID is required").max(128, "ID is too long");

const bookmarkIdsSchema = z
  .array(idSchema)
  .min(1, "At least one bookmark is required")
  .max(MAX_BOOKMARK_TARGETS, `At most ${MAX_BOOKMARK_TARGETS} bookmarks are allowed`)
  .transform((ids) => Array.from(new Set(ids)));

function isValidDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getDateOnlyTime(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

const dateOnlySchema = z
  .string()
  .trim()
  .refine(isValidDateOnly, "Date must use YYYY-MM-DD format");

const tagFilterSchema = z
  .string()
  .trim()
  .max(4096, "Tag filter is too long")
  .default("")
  .superRefine((value, ctx) => {
    if (!value) return;

    const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length > MAX_TAG_FILTER_IDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `At most ${MAX_TAG_FILTER_IDS} tags can be filtered at once`,
      });
    }

    if (ids.some((id) => id.length > 128)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tag filter contains an ID that is too long",
      });
    }
  });

const bookmarkTargetSchema = z
  .object({
    bookmarkId: idSchema.optional(),
    bookmarkIds: bookmarkIdsSchema.optional(),
  })
  .refine((value) => value.bookmarkId || value.bookmarkIds?.length, {
    message: "At least one bookmark target is required",
    path: ["bookmarkIds"],
  });

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(50, "Tag name too long"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color format")
    .optional(),
  bookmarkId: idSchema.optional(),
  bookmarkIds: bookmarkIdsSchema.optional(),
});

export const deleteTagSchema = z.object({
  tagId: idSchema,
  bookmarkId: idSchema.optional(),
  bookmarkIds: bookmarkIdsSchema.optional(),
});

export const patchTagSchema = z.object({
  tagId: idSchema,
  name: z.string().trim().min(1, "Tag name is required").max(50, "Tag name too long").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color format").optional(),
}).refine((value) => value.name || value.color, {
  message: "At least one of name or color is required",
  path: ["name"],
});

export const createNoteSchema = z.object({
  bookmarkId: idSchema,
  content: z.string().min(1, "Content is required").max(10000, "Note too long"),
});

export const deleteNoteSchema = z.object({
  noteId: idSchema,
});

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Collection name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  isPublic: z.boolean().optional(),
});

export const patchCollectionSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

export const addCollectionItemSchema = bookmarkTargetSchema;

export const deleteCollectionItemSchema = bookmarkTargetSchema;

export const reorderCollectionItemsSchema = z.object({
  items: z.array(
    z.object({
      bookmarkId: idSchema,
      sortOrder: z.number().int().min(0).max(10000),
    })
  )
    .min(1, "Items array is required")
    .max(MAX_REORDER_ITEMS, `At most ${MAX_REORDER_ITEMS} items can be reordered at once`),
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (seen.has(item.bookmarkId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "bookmarkId"],
        message: "Duplicate bookmark ID in reorder request",
      });
    }
    seen.add(item.bookmarkId);
  }
});

export const deleteBookmarkSchema = bookmarkTargetSchema;

export const bookmarksQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(MAX_BOOKMARK_QUERY_PAGE).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(MAX_BOOKMARK_QUERY_LENGTH).default(""),
    sortField: z
      .enum(["bookmarkedAt", "tweetCreatedAt", "likes", "retweets", "replies", "performance", "authorUsername"])
      .default("bookmarkedAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    mediaFilter: z.enum(["all", "images", "video", "links", "text-only"]).default("all"),
    authorFilter: z.string().trim().max(MAX_BOOKMARK_FILTER_LENGTH).default(""),
    tagFilter: tagFilterSchema,
    dateFrom: dateOnlySchema.optional(),
    dateTo: dateOnlySchema.optional(),
    bookmarkId: idSchema.optional(),
    collectionId: idSchema.optional(),
    unaffiliated: booleanQueryFlagSchema,
    raw: booleanQueryFlagSchema,
    personalBoost: booleanQueryFlagSchema,
  })
  .superRefine((value, ctx) => {
    if (
      value.dateFrom &&
      value.dateTo &&
      getDateOnlyTime(value.dateFrom) > getDateOnlyTime(value.dateTo)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "dateTo must be on or after dateFrom",
      });
    }

    if (value.unaffiliated) {
      const hasTagFilter = value.tagFilter.split(",").some((id) => id.trim().length > 0);
      if (hasTagFilter) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tagFilter"],
          message:
            "unaffiliated=true cannot be combined with tagFilter (unaffiliated bookmarks have no tags by definition).",
        });
      }

      if (value.collectionId && value.collectionId.trim().length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["collectionId"],
          message:
            "unaffiliated=true cannot be combined with collectionId (Orbit queue bookmarks are outside editable collections).",
        });
      }
    }

    if (value.raw) {
      const hasTagFilter = value.tagFilter.split(",").some((id) => id.trim().length > 0);
      if (hasTagFilter) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tagFilter"],
          message:
            "raw=true cannot be combined with tagFilter (raw highlights are strictly untouched bookmarks with no tags).",
        });
      }

      if (value.collectionId && value.collectionId.trim().length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["collectionId"],
          message:
            "raw=true cannot be combined with collectionId (raw highlights target completely unaffiliated bookmarks outside any collections).",
        });
      }
    }
  });

export const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

// Orbit Graph query parameters
export const MAX_ORBIT_GRAPH_NODE_CAP = 4000;
export const DEFAULT_ORBIT_GRAPH_NODE_CAP = 1500;

export const orbitGraphQuerySchema = z.object({
  nodeCap: z.coerce
    .number()
    .int()
    .min(1, "nodeCap must be at least 1")
    .max(MAX_ORBIT_GRAPH_NODE_CAP, `nodeCap cannot exceed ${MAX_ORBIT_GRAPH_NODE_CAP}`)
    .default(DEFAULT_ORBIT_GRAPH_NODE_CAP)
    .optional(),
});
