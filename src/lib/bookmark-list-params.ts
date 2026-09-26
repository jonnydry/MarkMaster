/** Page size for the dashboard bookmark feed. */
export const BOOKMARK_LIST_PAGE_LIMIT = "20";

type BookmarkListQueryInput = {
  page: number;
  limit?: string;
  search?: string;
  sortField: string;
  sortDirection: string;
  mediaFilter: string;
  authorFilter?: string;
  tagFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  timeZone?: string;
  collectionId?: string;
  bookmarkId?: string;
  cursor?: string;
};

/** Query string shared by the dashboard feed and nav prefetch. */
export function buildBookmarkListQueryString(input: BookmarkListQueryInput) {
  const params = new URLSearchParams({
    page: String(input.page),
    limit: input.limit ?? BOOKMARK_LIST_PAGE_LIMIT,
    search: input.search ?? "",
    sortField: input.sortField,
    sortDirection: input.sortDirection,
    mediaFilter: input.mediaFilter,
    authorFilter: input.authorFilter ?? "",
    tagFilter: input.tagFilter ?? "",
  });

  if (input.dateFrom) params.set("dateFrom", input.dateFrom);
  if (input.dateTo) params.set("dateTo", input.dateTo);
  if ((input.dateFrom || input.dateTo) && input.timeZone) {
    params.set("timeZone", input.timeZone);
  }
  if (input.collectionId) params.set("collectionId", input.collectionId);
  if (input.bookmarkId) params.set("bookmarkId", input.bookmarkId);
  if (input.cursor) params.set("cursor", input.cursor);

  return params.toString();
}

/** First page of the default newest-first feed. */
export function defaultBookmarkListQueryString() {
  return buildBookmarkListQueryString({
    page: 1,
    sortField: "tweetCreatedAt",
    sortDirection: "desc",
    mediaFilter: "all",
  });
}
