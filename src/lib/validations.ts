import { z } from "zod";

const booleanQueryFlagSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const bookmarkIdsSchema = z
  .array(z.string().min(1, "Bookmark ID is required"))
  .min(1, "At least one bookmark is required");

const bookmarkTargetSchema = z
  .object({
    bookmarkId: z.string().min(1, "Bookmark ID is required").optional(),
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
  bookmarkId: z.string().min(1).optional(),
  bookmarkIds: bookmarkIdsSchema.optional(),
});

export const deleteTagSchema = z.object({
  tagId: z.string().min(1, "Tag ID is required"),
  bookmarkId: z.string().min(1).optional(),
  bookmarkIds: bookmarkIdsSchema.optional(),
});

export const patchTagSchema = z.object({
  tagId: z.string().min(1, "Tag ID is required"),
  name: z.string().trim().min(1, "Tag name is required").max(50, "Tag name too long").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color format").optional(),
}).refine((value) => value.name || value.color, {
  message: "At least one of name or color is required",
  path: ["name"],
});

export const createNoteSchema = z.object({
  bookmarkId: z.string().min(1, "Bookmark ID is required"),
  content: z.string().min(1, "Content is required").max(10000, "Note too long"),
});

export const deleteNoteSchema = z.object({
  noteId: z.string().min(1, "Note ID is required"),
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
      bookmarkId: z.string().min(1),
      sortOrder: z.number().int().min(0),
    })
  ).min(1, "Items array is required"),
});

export const deleteBookmarkSchema = bookmarkTargetSchema;

export const bookmarksQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().default(""),
    sortField: z
      .enum(["bookmarkedAt", "tweetCreatedAt", "likes", "retweets", "replies", "authorUsername"])
      .default("bookmarkedAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    mediaFilter: z.enum(["all", "images", "video", "links", "text-only"]).default("all"),
    authorFilter: z.string().default(""),
    tagFilter: z.string().default(""),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    collectionId: z.string().optional(),
    unaffiliated: booleanQueryFlagSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.unaffiliated) return;

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
          "unaffiliated=true cannot be combined with collectionId (unaffiliated bookmarks are not in any collection).",
      });
    }
  });

export const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});
