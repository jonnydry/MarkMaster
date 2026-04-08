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

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.AUTH_TWITTER_ID!,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();

  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(data.refresh_token),
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

  const response = await fetch(
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
    throw new Error(`X API error: ${response.status} ${response.statusText}`);
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

    const response = await fetch(
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
      throw new Error(`X bookmark folders error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as XApiResponse<BookmarkFolder[]>;
    folders.push(...(json.data || []));
    paginationToken = json.meta?.next_token;
  } while (paginationToken);

  return { folders, rateLimit: lastRateLimit };
}

export async function fetchBookmarksByFolder(
  userId: string,
  xUserId: string,
  folderId: string
): Promise<{ bookmarks: BookmarkData[]; rateLimit: RateLimitInfo }> {
  const token = await getFreshXAccessToken(userId);
  const response = await fetch(
    `${BASE_URL}/users/${xUserId}/bookmarks/folders/${folderId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const rateLimit = readRateLimit(response);

  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError(rateLimit);
    }
    throw new Error(
      `X bookmark folder posts error: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as XApiResponse<Array<{ id: string }>>;
  const tweetIds = (json.data || []).map((tweet) => tweet.id);

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
  const token = await getFreshXAccessToken(userId);
  const params = buildTweetQueryParams(tweetIds);

  const response = await fetch(`${BASE_URL}/tweets?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const rateLimit = readRateLimit(response);

  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError(rateLimit);
    }
    throw new Error(`X tweet lookup error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as XApiResponse<XTweet[]>;
  return { bookmarks: parseBookmarkPayload(json, tweetIds), rateLimit };
}

export class RateLimitError extends Error {
  rateLimit: RateLimitInfo;
  constructor(rateLimit: RateLimitInfo) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.rateLimit = rateLimit;
  }
}
