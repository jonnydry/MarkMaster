import { prisma } from "./prisma";
import { encrypt, decrypt } from "./encryption";

const BASE_URL = "https://api.x.com/2";

interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

interface BookmarkFolder {
  id: string;
  name: string;
}

interface XApiResponse<T> {
  data?: T;
  meta?: { next_token?: string; result_count?: number };
  errors?: Array<{ message: string; title: string }>;
  includes?: {
    users?: XUser[];
    media?: XMedia[];
    tweets?: XTweet[];
  };
}

export interface XUser {
  id: string;
  name: string;
  username: string;
  description?: string;
  profile_image_url?: string;
  verified?: boolean;
  verified_type?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

export interface XMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  alt_text?: string;
  public_metrics?: {
    view_count?: number;
  };
  variants?: Array<{
    bit_rate?: number;
    content_type: string;
    url: string;
  }>;
}

export interface XTweetEntities {
  urls?: Array<{
    start: number;
    end: number;
    url: string;
    expanded_url: string;
    display_url: string;
    title?: string;
    description?: string;
    images?: Array<{ url: string; width: number; height: number }>;
  }>;
  mentions?: Array<{ start: number; end: number; username: string }>;
}

export interface XTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  lang?: string;
  possibly_sensitive?: boolean;
  conversation_id?: string;
  community_id?: string;
  context_annotations?: Array<{
    domain?: {
      id?: string;
      name?: string;
      description?: string;
    };
    entity?: {
      id?: string;
      name?: string;
      description?: string;
    };
  }>;
  note_tweet?: {
    text?: string;
    entities?: XTweetEntities;
  };
  article?: unknown;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number;
    impression_count: number;
  };
  attachments?: { media_keys?: string[] };
  entities?: XTweetEntities;
  referenced_tweets?: Array<{ type: string; id: string }>;
}

export interface BookmarkData {
  tweet: XTweet;
  author: XUser;
  media: XMedia[];
  quotedTweet?: XTweet & { author?: XUser };
}

function buildTweetQueryParams(ids?: string[]) {
  const params = new URLSearchParams({
    "tweet.fields":
      "created_at,public_metrics,entities,referenced_tweets,attachments,author_id,context_annotations,lang,possibly_sensitive,conversation_id,community_id,note_tweet,article",
    "user.fields":
      "name,username,description,profile_image_url,verified,verified_type,public_metrics",
    expansions: "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
    "media.fields":
      "type,url,preview_image_url,width,height,variants,duration_ms,alt_text,public_metrics",
  });

  if (ids && ids.length > 0) {
    params.set("ids", ids.join(","));
  }

  return params;
}

const RATE_LIMIT_RESET_FALLBACK_MS = 15 * 60 * 1000;

function readRateLimit(response: Response): RateLimitInfo {
  // A missing/garbled reset header must not produce an epoch-0 resetAt (the
  // UI would render a meaningless "resets at"); assume a conservative window.
  const resetSeconds = Number.parseInt(
    response.headers.get("x-rate-limit-reset") ?? "",
    10
  );
  return {
    remaining: parseInt(response.headers.get("x-rate-limit-remaining") || "0"),
    limit: parseInt(response.headers.get("x-rate-limit-limit") || "180"),
    resetAt:
      Number.isFinite(resetSeconds) && resetSeconds > 0
        ? new Date(resetSeconds * 1000)
        : new Date(Date.now() + RATE_LIMIT_RESET_FALLBACK_MS),
  };
}

async function readXApiErrorBody(response: Response): Promise<string | null> {
  try {
    const json = (await response.json()) as {
      errors?: Array<{ message?: string; detail?: string; title?: string }>;
      error?: string;
      error_description?: string;
      reason?: string;
    };
    if (json.errors?.length) {
      return (
        json.errors
          .map((e) => e.message || e.detail || e.title)
          .filter(Boolean)
          .join("; ") || null
      );
    }
    if (json.error && json.error_description) {
      return `${json.error}: ${json.error_description}`;
    }
    if (json.error) {
      return json.error;
    }
    if (json.reason) {
      return json.reason;
    }
  } catch {
    // ignore
  }
  return null;
}

const FETCH_TIMEOUT_MS = 30_000;

/** X tweet lookup is documented up to 100 IDs; smaller batches avoid intermittent failures. */
const TWEET_LOOKUP_BATCH_SIZE = 50;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: init?.signal ?? controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
}

function parseBookmarkPayload(
  json: XApiResponse<XTweet[]>,
  orderIds?: string[]
): BookmarkData[] {
  if (!json.data) {
    return [];
  }

  const userMap = new Map<string, XUser>();
  json.includes?.users?.forEach((u) => userMap.set(u.id, u));

  const mediaMap = new Map<string, XMedia>();
  json.includes?.media?.forEach((m) => mediaMap.set(m.media_key, m));

  const tweetMap = new Map<string, XTweet>();
  json.includes?.tweets?.forEach((t) => tweetMap.set(t.id, t));

  const bookmarks: BookmarkData[] = json.data.map((tweet) => {
    const author = userMap.get(tweet.author_id) || {
      id: tweet.author_id,
      name: "Unknown",
      username: "unknown",
    };

    const media: XMedia[] = (tweet.attachments?.media_keys || [])
      .map((key) => mediaMap.get(key))
      .filter(Boolean) as XMedia[];

    let quotedTweet: (XTweet & { author?: XUser }) | undefined;
    const quoteRef = tweet.referenced_tweets?.find((r) => r.type === "quoted");
    if (quoteRef) {
      const qt = tweetMap.get(quoteRef.id);
      if (qt) {
        quotedTweet = { ...qt, author: userMap.get(qt.author_id) };
      }
    }

    return { tweet, author, media, quotedTweet };
  });

  if (!orderIds) {
    return bookmarks;
  }

  const order = new Map(orderIds.map((id, index) => [id, index]));
  return bookmarks.sort(
    (a, b) => (order.get(a.tweet.id) ?? 0) - (order.get(b.tweet.id) ?? 0)
  );
}

/**
 * In-process single-flight: concurrent callers within one invocation (e.g. a
 * sync pagination loop racing an Orbit scan) share the same refresh promise.
 */
const inflightTokenRefreshes = new Map<string, Promise<string>>();

/**
 * X rotates refresh tokens on every use, so refreshes must be serialized per
 * user: two concurrent exchanges with the same stored refresh token either
 * fail with invalid_grant or race their DB writes — and the losing write can
 * overwrite the freshly rotated refresh token with a stale one, permanently
 * breaking the connection until the user re-authenticates.
 */
async function refreshAccessToken(userId: string): Promise<string> {
  const existing = inflightTokenRefreshes.get(userId);
  if (existing) return existing;

  const promise = refreshAccessTokenSerialized(userId).finally(() => {
    inflightTokenRefreshes.delete(userId);
  });
  inflightTokenRefreshes.set(userId, promise);
  return promise;
}

async function refreshAccessTokenSerialized(userId: string): Promise<string> {
  return prisma.$transaction(
    async (tx) => {
      // Serialize across instances/invocations. Released on commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`token:${userId}`}))`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
      });
      if (!user) throw new Error("User not found");

      // Another holder refreshed while we waited for the lock — reuse its token.
      if (
        user.tokenExpiresAt &&
        user.tokenExpiresAt.getTime() >= Date.now() + 60_000
      ) {
        return decrypt(user.accessToken);
      }

      const accessToken = await exchangeRefreshToken(
        tx,
        userId,
        decrypt(user.refreshToken)
      );
      return accessToken;
    },
    // The token-endpoint fetch runs while holding the lock; give the
    // interactive transaction enough budget for the 30s fetch timeout.
    { timeout: 45_000, maxWait: 10_000 }
  );
}

async function exchangeRefreshToken(
  tx: Pick<typeof prisma, "user">,
  userId: string,
  refreshToken: string
): Promise<string> {
  const clientId = process.env.AUTH_TWITTER_ID;
  const clientSecret = process.env.AUTH_TWITTER_SECRET;
  if (!clientId) {
    throw new Error("AUTH_TWITTER_ID is not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // Confidential OAuth clients must authenticate to the token endpoint (X rejects
  // refresh with client_id-only body for typical web apps).
  if (clientSecret) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  } else {
    body.set("client_id", clientId);
  }

  const response = await fetchWithTimeout("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const detail = await readXApiErrorBody(response);
    throw new Error(
      detail
        ? `Token refresh failed: ${detail}`
        : `Token refresh failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const nextRefresh =
    typeof data.refresh_token === "string" && data.refresh_token.length > 0
      ? data.refresh_token
      : refreshToken;

  await tx.user.update({
    where: { id: userId },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(nextRefresh),
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenRefreshedAt: new Date(),
    },
  });

  return data.access_token;
}

async function getValidToken(
  userId: string,
  currentToken: string,
  expiresAt: Date | null
): Promise<string> {
  if (expiresAt && expiresAt.getTime() < Date.now() + 60_000) {
    return refreshAccessToken(userId);
  }
  return currentToken;
}

/** Resolves a non-expired user access token (refreshes when near expiry). */
export async function getFreshXAccessToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessToken: true, tokenExpiresAt: true },
  });
  if (!user) throw new Error("User not found");
  const accessToken = decrypt(user.accessToken);
  return getValidToken(userId, accessToken, user.tokenExpiresAt);
}

export async function fetchBookmarks(
  userId: string,
  xUserId: string,
  paginationToken?: string
): Promise<{
  bookmarks: BookmarkData[];
  nextToken?: string;
  rateLimit: RateLimitInfo;
}> {
  const token = await getFreshXAccessToken(userId);

  const params = buildTweetQueryParams();
  params.set("max_results", "100");

  if (paginationToken) {
    params.set("pagination_token", paginationToken);
  }

  const response = await fetchWithTimeout(
    `${BASE_URL}/users/${xUserId}/bookmarks?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const rateLimit = readRateLimit(response);

  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError(rateLimit);
    }
    const detail = await readXApiErrorBody(response);
    throw new Error(
      detail ?? `X API error: ${response.status} ${response.statusText}`
    );
  }

  const json: XApiResponse<XTweet[]> = await response.json();

  return {
    bookmarks: parseBookmarkPayload(json),
    nextToken: json.meta?.next_token,
    rateLimit,
  };
}

// Hard caps on X pagination loops: a malformed or repeating next_token from
// the API must not spin until maxDuration kills the function (burning the
// user's rate-limit budget along the way).
const MAX_FOLDER_LIST_PAGES = 10; // 100 folders/page → 1,000 folders
const MAX_FOLDER_TWEET_PAGES = 50;

export async function fetchBookmarkFolders(
  userId: string,
  xUserId: string
): Promise<{ folders: BookmarkFolder[]; rateLimit: RateLimitInfo }> {
  const token = await getFreshXAccessToken(userId);
  const folders: BookmarkFolder[] = [];
  let paginationToken: string | undefined;
  let pagesFetched = 0;
  let lastRateLimit: RateLimitInfo = {
    remaining: 0,
    limit: 180,
    resetAt: new Date(0),
  };

  do {
    const params = new URLSearchParams({ max_results: "100" });
    if (paginationToken) {
      params.set("pagination_token", paginationToken);
    }

    const response = await fetchWithTimeout(
      `${BASE_URL}/users/${xUserId}/bookmarks/folders?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    lastRateLimit = readRateLimit(response);

    if (!response.ok) {
      if (response.status === 429) {
        throw new RateLimitError(lastRateLimit);
      }
      const detail = await readXApiErrorBody(response);
      throw new Error(
        detail ??
          `X bookmark folders error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as XApiResponse<BookmarkFolder[]>;
    folders.push(...(json.data || []));
    pagesFetched += 1;
    const nextToken = json.meta?.next_token;
    // Stop on a repeated token (API echoing the same cursor) or the page cap.
    paginationToken =
      nextToken === paginationToken || pagesFetched >= MAX_FOLDER_LIST_PAGES
        ? undefined
        : nextToken;
  } while (paginationToken);

  return { folders, rateLimit: lastRateLimit };
}

/**
 * GET /2/users/{id}/bookmarks/folders/{folder_id} only allows path params (id,
 * folder_id). It returns tweet id stubs — hydrate via /2/tweets.
 */
async function fetchBookmarkFolderTweetIds(
  userId: string,
  xUserId: string,
  folderId: string
): Promise<{ tweetIds: string[]; rateLimit: RateLimitInfo }> {
  const tweetIds: string[] = [];
  const seenIds = new Set<string>();
  let paginationToken: string | undefined;
  let pagesFetched = 0;
  let lastRateLimit: RateLimitInfo = {
    remaining: 0,
    limit: 180,
    resetAt: new Date(0),
  };

  do {
    const token = await getFreshXAccessToken(userId);
    const path = `${BASE_URL}/users/${xUserId}/bookmarks/folders/${folderId}`;
    const url =
      paginationToken === undefined
        ? path
        : `${path}?${new URLSearchParams({ pagination_token: paginationToken })}`;

    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    lastRateLimit = readRateLimit(response);

    if (!response.ok) {
      if (response.status === 429) {
        throw new RateLimitError(lastRateLimit);
      }
      const detail = await readXApiErrorBody(response);
      throw new Error(
        detail ??
          `X bookmark folder posts error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as XApiResponse<Array<{ id: string }>>;
    for (const row of json.data || []) {
      if (row?.id && !seenIds.has(row.id)) {
        seenIds.add(row.id);
        tweetIds.push(row.id);
      }
    }
    pagesFetched += 1;
    const nextToken = json.meta?.next_token;
    paginationToken =
      nextToken === paginationToken || pagesFetched >= MAX_FOLDER_TWEET_PAGES
        ? undefined
        : nextToken;
  } while (paginationToken);

  return { tweetIds, rateLimit: lastRateLimit };
}

export async function fetchBookmarksByFolder(
  userId: string,
  xUserId: string,
  folderId: string
): Promise<{ bookmarks: BookmarkData[]; rateLimit: RateLimitInfo }> {
  const { tweetIds, rateLimit } = await fetchBookmarkFolderTweetIds(
    userId,
    xUserId,
    folderId
  );

  if (tweetIds.length === 0) {
    return { bookmarks: [], rateLimit };
  }

  const details = await fetchPostsByIds(userId, tweetIds);
  return { bookmarks: details.bookmarks, rateLimit: details.rateLimit };
}

export async function refreshBookmarkDataByTweetIds(
  userId: string,
  tweetIds: string[]
): Promise<{ bookmarks: BookmarkData[]; rateLimit: RateLimitInfo }> {
  return fetchPostsByIds(userId, tweetIds);
}

async function fetchPostsByIds(
  userId: string,
  tweetIds: string[]
): Promise<{ bookmarks: BookmarkData[]; rateLimit: RateLimitInfo }> {
  const batches: string[][] = [];
  for (let i = 0; i < tweetIds.length; i += TWEET_LOOKUP_BATCH_SIZE) {
    batches.push(tweetIds.slice(i, i + TWEET_LOOKUP_BATCH_SIZE));
  }

  const combined: BookmarkData[] = [];
  let lastRateLimit: RateLimitInfo = {
    remaining: 0,
    limit: 180,
    resetAt: new Date(0),
  };

  for (const batch of batches) {
    const token = await getFreshXAccessToken(userId);
    const params = buildTweetQueryParams(batch);

    const response = await fetchWithTimeout(`${BASE_URL}/tweets?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    lastRateLimit = readRateLimit(response);

    if (!response.ok) {
      if (response.status === 429) {
        throw new RateLimitError(lastRateLimit);
      }
      const detail = await readXApiErrorBody(response);
      throw new Error(
        detail ??
          `X tweet lookup error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as XApiResponse<XTweet[]>;
    combined.push(...parseBookmarkPayload(json, batch));
  }

  return { bookmarks: combined, rateLimit: lastRateLimit };
}

export class RateLimitError extends Error {
  rateLimit: RateLimitInfo;
  constructor(rateLimit: RateLimitInfo) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.rateLimit = rateLimit;
  }
}
