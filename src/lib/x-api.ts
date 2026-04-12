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
  profile_image_url?: string;
  verified?: boolean;
}

export interface XMedia {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
}

export interface XTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number;
    impression_count: number;
  };
  attachments?: { media_keys?: string[] };
  entities?: {
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
  };
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
    "tweet.fields": "created_at,public_metrics,entities,referenced_tweets,attachments,author_id",
    "user.fields": "name,username,profile_image_url,verified",
    expansions: "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
    "media.fields": "type,url,preview_image_url,width,height",
  });

  if (ids && ids.length > 0) {
    params.set("ids", ids.join(","));
  }

  return params;
}

function readRateLimit(response: Response): RateLimitInfo {
  return {
    remaining: parseInt(response.headers.get("x-rate-limit-remaining") || "0"),
    limit: parseInt(response.headers.get("x-rate-limit-limit") || "180"),
    resetAt: new Date(
      parseInt(response.headers.get("x-rate-limit-reset") || "0") * 1000
    ),
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

async function refreshAccessToken(
  userId: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { refreshToken: true },
  });
  if (!user) throw new Error("User not found");

  const refreshToken = decrypt(user.refreshToken);

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

  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(nextRefresh),
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
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

export async function fetchBookmarkFolders(
  userId: string,
  xUserId: string
): Promise<{ folders: BookmarkFolder[]; rateLimit: RateLimitInfo }> {
  const token = await getFreshXAccessToken(userId);
  const folders: BookmarkFolder[] = [];
  let paginationToken: string | undefined;
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
    paginationToken = json.meta?.next_token;
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
    paginationToken = json.meta?.next_token;
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
