# Rate Limiting

MarkMaster uses **per-user rate limiting** backed by Upstash Redis to protect expensive operations (especially X API usage) and ensure fair usage when the app is used by multiple people.

## Current Limits (Conservative Defaults)

| Action            | Limit         | Window     | Notes |
|-------------------|---------------|------------|-------|
| **Sync**          | 1 request     | 30 minutes | Most expensive operation |
| **Orbit Scan**    | 10 requests   | 1 day      | More generous than sync |
| **Orbit Library** | 24 requests   | 1 day      | One Classify click starts a background drain of the untagged queue |
| **Orbit Graph**   | 120 requests  | 1 hour     | Orbit map graph reads (GET `/api/orbit/graph`) |
| **API Reads**     | 100 requests  | 5 minutes  | General data fetching (bookmarks, analytics, export, etc.) |
| **API Writes**    | 30 requests   | 5 minutes  | Creating/updating tags, collections, notes, etc. |
| **Flywheel**      | 120 requests  | 5 minutes  | Instrumentation ingest; exempt from the proxy `api:write` debit |
| **Orbit Snapshot**| 120 requests  | 5 minutes  | Durable scan-plan upsert; exempt from the proxy `api:write` debit |
| **Media**         | 600 requests  | 5 minutes  | Authenticated media proxy range requests |
| **CSP report**    | 200 requests  | 5 minutes  | Public ingestion, keyed by IP |

These limits are **per user**, except CSP reports (IP-keyed).

## Protected Routes

**Special expensive operations** (dedicated buckets in the route handler):
- `POST /api/bookmarks/sync` → `"sync"` + global sync cap
- `POST /api/orbit/scan` → `"orbit"` + global orbit cap
- `POST /api/orbit/library-classify` → `"orbit:library"`
- `GET /api/orbit/library-classify` → `"api:read"` (count query; skipped by the proxy so it is not double-charged)
- `GET /api/orbit/graph` → `"orbit:graph"`
- `POST /api/flywheel` → `"flywheel"`
- `GET/PUT/DELETE /api/orbit/scan-snapshot` → `"orbit:snapshot"`
- `GET /api/media` → `"media"`
- `GET /api/export` → `"api:read"` (handler-owned, skipped by the proxy)

**General API** (proxy `api:read` / `api:write` unless listed as lightweight):
- Most `GET` routes → `"api:read"`
- Most write routes (POST/PATCH/DELETE on tags, notes, bookmarks) → `"api:write"`

**Collection mutations apply `api:write` in the handler** and are exempted from the proxy debit so they are not double-charged:
- `/api/collections` (POST)
- `/api/collections/[id]` (PATCH/DELETE)
- `/api/collections/[id]/items` (POST/DELETE/PATCH)
- `/api/collections/[id]/copy`
- `/api/collections/[id]/publish`

**Intentionally unprotected or lightly protected**:
- `/api/auth/*` (OAuth flows)
- `/api/orbit/status` (lightweight polling)
- `/api/csp-report` (public endpoint; IP bucket above)
- `/api/debug/rate-limits` (internal admin tool)

Lightweight exemptions live in `src/lib/lightweight-api-routes.ts`.

## Global Safety Limits

In addition to per-user limits, the system enforces **global** (system-wide) caps to prevent abuse:

- **Sync**: Max 50 syncs per hour across all users
- **Orbit**: Max 200 orbit scans per day across all users

This protects the X API quota and server resources when the app is open-sourced or has many users.

## How It Works

- **Two layers of protection**:
  1. **Proxy** (`src/proxy.ts`): Global IP-based rate limiting (500 req/min) + per-user `api:read` / `api:write` for most routes. Global and per-user checks run concurrently.
  2. **Per-route**: Specific expensive actions (sync, orbit scan, flywheel, etc.) use dedicated policies via `checkRateLimit()`.

- Rate limiting uses sliding windows via `@upstash/ratelimit` with analytics disabled (one Redis roundtrip per check).
- When a user exceeds a limit, the API returns **HTTP 429** with a `Retry-After` header.
- The frontend shows a friendly message with a countdown when possible (especially on the Sync button).
- All rate limiting is **fail-open**: if Upstash is unreachable or misconfigured, requests are allowed (with logging). This protects availability during outages.

## Development

When `UPSTASH_REDIS_REST_URL` is not set (typical in local development), rate limiting is **automatically disabled** so you are not blocked while working.

You can view and reset your current rate limit usage at:

```
/debug/rate-limits
```

This page also allows you to manually reset individual limits during testing.

## Configuration

All limits are defined centrally in `src/lib/rate-limit.ts` in the `POLICIES` object. You can adjust them easily there.

Example:

```ts
const POLICIES = {
  sync: { requests: 1, window: "30 m", ... },
  orbit: { requests: 10, window: "1 d", ... },
  ...
};
```

## Future Improvements

Possible enhancements for when the app is public or has more users:

- Tiered limits (free vs paid / power users)
- More granular per-route or per-action limits (e.g., heavier limits on export)
- Admin dashboard for monitoring usage (`/debug/rate-limits` is currently internal)
- Automatic notifications when users frequently hit limits

---

**Last updated**: September 2026 (orbit scan snapshot persist)
