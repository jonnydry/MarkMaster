# Rate Limiting

MarkMaster uses **per-user rate limiting** backed by Upstash Redis to protect expensive operations (especially X API usage) and ensure fair usage when the app is used by multiple people.

## Current Limits (Conservative Defaults)

| Action          | Limit              | Window      | Notes |
|-----------------|--------------------|-------------|-------|
| **Sync**        | 1 request          | 30 minutes  | Most expensive operation |
| **Orbit Scan**  | 10 requests        | 1 day       | More generous than sync |
| **API Reads**   | 100 requests       | 5 minutes   | General data fetching (bookmarks, analytics, export, orbit/graph) |
| **API Writes**  | 30 requests        | 5 minutes   | Creating/updating tags, collections, notes, etc. |

These limits are **per user**.

## Protected Routes (as of April 2026)

**Special expensive operations** (with dedicated tight limits):
- `POST /api/bookmarks/sync` → `"sync"` + global sync cap
- `POST /api/orbit/scan` → `"orbit"` + global orbit cap

**General API**:
- Most `GET` routes → `"api:read"`
- Most write routes (POST/PATCH/DELETE on tags, collections, notes, bookmarks) → `"api:write"`

**Routes with per-user rate limiting**:
- `/api/analytics`
- `/api/bookmarks` (DELETE)
- `/api/bookmarks/sync`
- `/api/collections` (POST)
- `/api/export`
- `/api/notes` (POST + DELETE)
- `/api/orbit/scan`
- `/api/tags` (POST/PATCH/DELETE)

**Routes with only global IP protection** (via middleware) — these were added during final review:
- `/api/collections/[id]/items` (POST/DELETE/PATCH)
- `/api/collections/[id]` (PATCH)
- `/api/collections/[id]/copy`
- `/api/collections/[id]/publish`
- `/api/orbit/graph` (GET)

**Intentionally unprotected or lightly protected**:
- `/api/auth/*` (OAuth flows)
- `/api/orbit/status` (lightweight polling)
- `/api/csp-report` (public endpoint)
- `/api/debug/rate-limits` (internal admin tool)

## Global Safety Limits

In addition to per-user limits, the system enforces **global** (system-wide) caps to prevent abuse:

- **Sync**: Max 50 syncs per hour across all users
- **Orbit**: Max 200 orbit scans per day across all users

This protects the X API quota and server resources when the app is open-sourced or has many users.

## How It Works

- **Two layers of protection**:
  1. **Proxy** (`src/proxy.ts`): Provides global IP-based rate limiting (500 req/min across all IPs) + per-user `api:read` / `api:write` limits for most routes.
  2. **Per-route**: Specific expensive actions (sync, orbit scan, etc.) use tighter dedicated policies via `checkRateLimit()`.

- Rate limiting uses sliding windows via `@upstash/ratelimit`.
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
- Better reset mechanism for the debug tool (currently uses a timestamp hack)

**Note on Collections & Orbit Graph**: Some collection mutation routes (`/api/collections/[id]/items`, copy, publish, PATCH) and `/api/orbit/graph` currently rely only on the global IP limit rather than per-user limits. These were added during the final review and may be tightened with explicit per-user policies in the future if abuse patterns emerge.

**Debug Reset Mechanism**: The reset functionality in `/api/debug/rate-limits` uses a timestamp-based key trick to force a new bucket. This is documented in the code as a pragmatic solution for the internal tool.

---

**Last updated**: April 2026 (after full Security Hardening phase)
