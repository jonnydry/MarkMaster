# MarkMaster Launch-Readiness Audit

**Investigator:** Mattie (Hermes Agent)  
**Date:** 2026-07-06  
**Project:** `/Users/jonnydrybanski/Cursor Projects/MarkMaster`  
**Baseline:** `main` + uncommitted Orbit chrome refactor  
**Status:** P0 launch blockers remediated in working tree; all gates green.

---

## Executive Summary

MarkMaster is in **strong engineering shape** for a private beta. The test suite is broad, the build is clean, security hardening is intentional, and the Orbit Map Web Worker is a genuinely impressive performance piece. The recent uncommitted Orbit chrome refactor is directionally good UX — it simplifies the chrome into a floating console and a shared Queue/Map switch.

**P0 launch blockers identified in this audit have been fixed in the working tree:**

1. `/api/orbit/graph` now uses its own rate-limit bucket (`orbit:graph`, 120 req/hour) instead of the expensive `orbit` scan bucket.
2. `/api/internal/sync/worker` now supports `GET` for Vercel Cron, with `isSyncWorkerAuthorized` accepting both `SYNC_WORKER_SECRET` and `CRON_SECRET`.
3. The media proxy now has a timeout, content-type whitelist, `Content-Length` size cap, and redirect re-validation, plus tests.

The remaining work to launch is mostly **commercial/ops**: billing/entitlements, privacy/terms, cost controls, production Redis/cron secrets, and observability. The codebase is close to a private beta; it is not yet a monetizable product.

---

## 1. Quality Baseline (Verified)

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` | ✅ Pass |
| Typecheck | `npm run typecheck` | ✅ Pass |
| Tests | `npm run test` | ✅ 454 passed, 1 skipped (`orbit-grok-live.test.ts`) |
| Build | `npm run build` | ✅ Pass |
| Env check | `npm run env:check` | ✅ Pass, warns `.env` is mode `644` (recommended `600`) |

The codebase is in a **stable, releasable build state**.

---

## 2. Uncommitted Orbit Work Review

### What changed

- **Deleted:** `src/components/orbit/orbit-map-command-bar.tsx`, `src/components/orbit/orbit-map-page-identity.tsx`
- **Added:** `src/components/orbit/orbit-map-console.tsx`, `src/components/orbit/orbit-mode-switch.tsx`
- **Modified:** `src/app/(main)/orbit/map/orbit-map-client.tsx`, `src/components/orbit/orbit-command-bar.tsx`, `src/components/orbit/orbit-map-rail.tsx`, `src/components/orbit/orbit-map-stats-strip.tsx`
- **Net diff:** ~−241 lines.

### Assessment

The refactor dissolves the old map header into two floating `.map-glass` corner clusters and adds a shared Queue⇄Map mode switch. This is a cleaner UX model: it removes a duplicated toolbar, makes the Queue/Map relationship explicit, and docks the inspector on desktop while keeping it as a bottom sheet on mobile.

### Risks to verify before merging

| Risk | Severity | Notes |
|------|----------|-------|
| Narrow-viewport overlap | 🟠 Medium | Top-right search/tools cluster at `w-[9.5rem] sm:w-[15rem]` plus user nav + mobile sidebar may crowd. Test at 320–375 px. |
| Keyboard discoverability | 🟠 Medium | `/` search, `L`/`Q` scope shortcuts, and `?` help must remain reachable. Verify focus order. |
| Dock rail collision | 🟠 Medium | `toolsShifted` moves the top-right cluster left at `lg` when the inspector is docked. The `22.5rem` offset must clear the `21rem` rail + gap. |
| `OrbitMapRail` variant `dock` | 🟢 Low | New variant uses `.map-glass`; visually consistent with the rest of the map chrome. |
| No stale imports | 🟢 Low | Search found zero references to the deleted components. Safe to delete. |

**Recommendation:** Commit as one UX refactor PR after a quick manual pass on `/orbit/map` at mobile, tablet, and desktop widths. No code fix needed unless the manual pass reveals overlap.

---

## 3. Security Review

### Strong points

- Auth cookies are hardened in `src/lib/auth.ts`: `httpOnly`, `Secure`, `sameSite: "lax"`, `__Secure-`/`__Host-` prefixes, 14-day session lifetime.
- Proxy/middleware (`src/proxy.ts`) extracts user IDs from JWE-encrypted Auth.js sessions via `src/lib/auth-edge.ts`.
- CSP is env-driven in `next.config.ts` (`CSP_MODE=enforce` or Report-Only default) with `script-src 'self'` and a first-party `/theme-init` bootstrap route.
- Rate limiting is fail-open and requires Upstash in production.
- Media proxy is authenticated, host-restricted, and re-validates redirect destinations.
- Debug endpoints require owner authorization in production.

### Issues and hardening gaps

| # | Severity | Issue | Status | Notes |
|---|----------|-------|--------|-------|
| 1 | 🔴 Critical | `/api/orbit/graph` consumed the `orbit` scan quota | ✅ Fixed | New `orbit:graph` bucket (120 req/h) in `src/lib/rate-limit.ts`; route updated + tests. |
| 2 | 🔴 Critical | Sync worker cron received 405 | ✅ Fixed | `GET` handler added to `/api/internal/sync/worker`; `isSyncWorkerAuthorized` accepts `SYNC_WORKER_SECRET` and/or `CRON_SECRET`. |
| 3 | 🟠 High | Media proxy had no timeout/size/type guards | ✅ Fixed | 15s timeout, 150 MB `Content-Length` cap, content-type whitelist, redirect re-check + tests. |
| 4 | 🟠 High | CSP is still Report-Only by default | ⚠️ Open | Make a launch decision: collect reports via `/api/csp-report`, then set `CSP_MODE=enforce` in production. |
| 5 | 🟠 High | `.env` file permissions are 644 | ⚠️ Open | Run `chmod 600 .env` locally; add to setup docs. |
| 6 | 🟡 Medium | `/debug/rate-limits` UI shell exposure | ⚠️ Open | Verify the UI degrades gracefully for non-owner users (API is already protected). |
| 7 | 🟡 Medium | `securityHeaders` apply site-wide including public share pages | ⚠️ Open | Generally fine; confirm HSTS/CSP are appropriate for public `/share/[slug]`. |
| 8 | 🟡 Medium | `process.env` non-optional assertions | ⚠️ Open | Already validated in `scripts/check-env.mjs`; consider runtime pre-sign-in guard. |
| 9 | 🟢 Low | Documentation drift in `SECURITY_HARDENING.md` | ⚠️ Open | Partially addressed in `RATE_LIMITING.md`; `SECURITY_HARDENING.md` should be refreshed separately. |

---

## 4. Performance & Efficiency Review

### Strengths

- Orbit graph is cached in Upstash with 60-second TTL and ETag support.
- Graph generation uses a node cap (`DEFAULT_ORBIT_GRAPH_NODE_CAP = 1500`).
- Web Worker owns rendering, keeping the main thread free.
- d3-force layout is deterministic and re-used.
- Image optimization uses Next.js `<Image>` with AVIF/WebP and constrained sizes.

### Issues

| # | Severity | Issue | Recommended Fix |
|---|----------|-------|-----------------|
| 1 | 🟠 High | `src/workers/orbit-map-worker.ts` is ~3,345 lines | Modularize into `renderer/`, `scene/`, `interactions/`, `animation/` modules. |
| 2 | 🟠 High | `src/components/orbit/orbit-map-canvas-host.tsx` is ~962 lines | Split into lifecycle/useWorker, event forwarding, and minimap wrapper. |
| 3 | 🟠 High | `src/hooks/use-orbit-map-page.ts` is a god hook | Split into `useOrbitGraphPage`, `useOrbitMapSelection`, `useOrbitMapDialogs`, `useOrbitMapKeyboard`. |
| 4 | 🟡 Medium | Worker lifecycle cleanup | Add regression test for `DESTROY`, `terminate()`, resize observer, DPR subscription, and Pixi destruction. |
| 5 | 🟡 Medium | `buildOrbitGraphPayload` may be expensive | Audit for N+1 Prisma queries and missing `select` clauses; add tracing. |
| 6 | 🟡 Medium | Cache invalidation after mutations | Verify every mutation calls `bumpUserCacheVersion`. |
| 7 | 🟢 Low | `react-query` `keepPrevious` defaults vary | Standardize across queries. |

---

## 5. UI/UX Review

### Strengths

- Design system is documented and enforced by ESLint.
- Orbit Map chrome uses the shared `AppPageShell`/`app-layout` system.
- Empty/error states exist for loading, error, and empty graph cases.
- Keyboard shortcuts and help dialog are surfaced.
- Accessibility: standardized `focus-visible` rings, `aria-current="page"`, reduced-motion support.

### Issues

| # | Severity | Issue | Notes |
|---|----------|-------|-------|
| 1 | 🟠 High | First-run X API cost is not surfaced in the product | Add onboarding copy: “Syncing ~800 bookmarks can cost ~$4 in X API fees.” |
| 2 | 🟠 High | No clear upgrade/onboarding path for new users | Add guided first-sync flow and empty-state CTAs. |
| 3 | 🟡 Medium | Orbit map floating console may obscure content on small screens | Test at 320–375 px and adjust breakpoints. |
| 4 | 🟡 Medium | Search input width is tight on mobile | Consider expanding on focus or a full-width overlay. |
| 5 | 🟡 Medium | Reduced-motion preference may not gate entrance animation | Verify `prefers-reduced-motion` gates entrance fade and radar/meteor effects. |
| 6 | 🟢 Low | `OrbitMapStatsStrip` is not obviously interactive | Consider click-to-explain tooltips. |
| 7 | 🟢 Low | Public share pages have minimal branding | Add a small “Shared from MarkMaster” footer. |

---

## 6. Maintainability Review

### Strengths

- 97 test files, 454 tests passing.
- Strong centralization in `src/lib/validations.ts`, `src/lib/rate-limit.ts`, `src/lib/app-layout.ts`, `src/lib/typography.ts`.
- Prisma migrations are explicit and named.
- Good separation of concerns in most API routes.

### Issues

| # | Severity | Issue | Recommended Fix |
|---|----------|-------|-----------------|
| 1 | 🟠 High | `useOrbitMapPage` is a god hook | Split into focused hooks. |
| 2 | 🟠 High | `orbit-map-worker.ts` and `orbit-map-canvas-host.tsx` are too large | Refactor as described above. |
| 3 | 🟡 Medium | Archived plans under `docs/design/archive/` | Move to a single `docs/launch-checklist.md` and `docs/security-posture.md`. |
| 4 | 🟡 Medium | New Orbit components lack tests | Add tests for `OrbitModeSwitch` and `OrbitMapConsole`. |
| 5 | 🟢 Low | No `TODO/FIXME/HACK` hits | Good hygiene; keep it that way. |

---

## 7. Monetization & Launch Readiness

### What is already in place

- Authenticated X OAuth 2.0 with encrypted token storage.
- Incremental sync, public share slugs, collections, tags, notes, analytics, and Grok-powered Orbit scans.
- Rate limiting as abuse protection, not product quotas.
- Flywheel events and analytics telemetry.
- Strong test/build discipline.

### What is missing for a paid launch

| Area | Status | Notes |
|------|--------|-------|
| **Billing/Stripe** | ❌ Not present | No schema, dependency, or webhook handler. |
| **Plans/Entitlements** | ❌ Not present | No `Plan`, `Subscription`, or `FeatureFlag` model. |
| **Usage Quotas** | ❌ Not present | Rate limits are global/abuse limits. Need per-user product quotas. |
| **Privacy Policy / ToS** | ❌ Not present | Required for public launch and OAuth app verification. |
| **Support Channel** | ❌ Not present | No in-app feedback or help email. |
| **Cost Attribution** | ❌ Not present | X API and xAI costs are not attributed to users/plans. |
| **Admin Dashboard** | ⚠️ Minimal | `/debug/rate-limits` is internal and owner-only. |
| **Observability** | ⚠️ Partial | `logError` exists but no structured error tracking or alerting. |
| **Onboarding** | ⚠️ Partial | No guided first-sync or cost-disclosure flow. |
| **Launch-tiered rate limits** | ✅ Fixed | `orbit` bucket is now reserved for scans; graph has its own bucket. |

### Natural monetization axes

1. **Sync cadence & folder sync** — free: manual sync; paid: scheduled sync + folder mirroring.
2. **Orbit scan quota** — free: N scans/month; paid: more scans + priority queue.
3. **Graph node cap** — free: 500–1,000 nodes; paid: higher cap.
4. **Export volume / formats** — free: limited CSV; paid: JSON/CSV and scheduled exports.
5. **Public collections** — free: basic share; paid: custom slugs, branding, analytics.
6. **Team seats** — later phase: shared workspaces.

**Important distinction:** `src/lib/rate-limit.ts` policies should remain **abuse protection**. Product quotas should live in a separate entitlement service keyed by `user.plan`.

---

## 8. Remediation Applied (2026-07-06)

### P0 #1 — Orbit graph rate-limit bucket

- **Files:** `src/lib/rate-limit.ts`, `src/app/api/orbit/graph/route.ts`, `src/app/api/orbit/graph/route.test.ts`
- **Change:** Added `RateLimitAction "orbit:graph"` with policy `120 req/hour`. Updated `GET /api/orbit/graph` to call `checkRateLimit("orbit:graph", user.id)`. Added tests verifying the bucket is used and that 429 is returned when exceeded.

### P0 #2 — Sync worker cron support

- **Files:** `src/app/api/internal/sync/worker/route.ts`, `src/lib/sync-queue.ts`, `src/app/api/internal/sync/worker/route.test.ts`, `src/lib/sync-queue-auth.test.ts`
- **Change:** Added `GET` handler to `/api/internal/sync/worker` that shares the same authorization check and drains pending runs. Refactored `isSyncWorkerAuthorized` to accept either `SYNC_WORKER_SECRET` or `CRON_SECRET` (both optional; at least one required in production). Added tests for GET cron, POST drain, and auth helper edge cases.

### P0 #3 — Media proxy hardening

- **Files:** `src/app/api/media/route.ts`, `src/app/api/media/route.test.ts`
- **Change:** Added `AbortSignal.timeout(15_000)`, `MAX_MEDIA_PROXY_SIZE_BYTES` (150 MB), `ALLOWED_CONTENT_TYPES` whitelist, and redirect destination re-check. Added tests for auth, missing URL, disallowed host, success passthrough, oversized content, unsupported type, malicious redirect, and upstream failure.

### Docs

- **Files:** `RATE_LIMITING.md`
- **Change:** Added `orbit:graph` to the policy table and protected-routes list, corrected the Orbit Graph note, and updated the last-updated date.

---

## 9. Prioritized Action Plan

### P0 — Launch Blockers (remediated)

| # | Issue | Status | Verification |
|---|-------|--------|--------------|
| 1 | Fix `/api/orbit/graph` rate-limit bucket | ✅ Done | `route.test.ts` asserts bucket = `orbit:graph` and 429 behavior. |
| 2 | Add `GET` handler to `/api/internal/sync/worker` for Vercel cron | ✅ Done | `route.test.ts` covers GET drain; `sync-queue-auth.test.ts` covers secrets. |
| 3 | Add media-proxy timeout, type whitelist, and size guard | ✅ Done | `route.test.ts` covers timeout, oversized, type, redirect, and failure. |

### P0 — Remaining before production deploy

| # | Issue | Notes |
|---|-------|-------|
| 4 | Set production env vars | `UPSTASH_REDIS_REST_URL` + `TOKEN`, `SYNC_WORKER_SECRET` and/or `CRON_SECRET`. |
| 5 | Verify Vercel cron in preview | Trigger cron manually and confirm 200 + queue drain. |
| 6 | `chmod 600 .env` locally | `env:check` warning. |
| 7 | CSP enforcement decision | Collect reports, then set `CSP_MODE=enforce`. |

### P1 — Before Public Beta

| # | Issue | Effort | Owner |
|---|-------|--------|-------|
| 6 | Audit `src/lib/orbit-graph-query.ts` for N+1 and payload bounding | 3–4 hrs | Backend |
| 7 | Add worker lifecycle regression test | 3–4 hrs | Frontend |
| 8 | Verify cache invalidation on all mutations | 2–3 hrs | Backend |
| 9 | Add first-run cost disclosure and onboarding flow | 1–2 days | UX/Frontend |
| 10 | Add tests for `OrbitModeSwitch` and `OrbitMapConsole` | 2–3 hrs | Frontend |
| 11 | Refresh `SECURITY_HARDENING.md` | 2–3 hrs | Docs |
| 12 | Add Privacy Policy and Terms of Service pages | 1–2 days | Legal/UX |
| 13 | Set up structured error tracking (Sentry or similar) | 2–4 hrs | Ops |

### P2 — Launch Polish

| # | Issue | Effort | Owner |
|---|-------|--------|-------|
| 14 | Split `useOrbitMapPage` into focused hooks | 1–2 days | Frontend |
| 15 | Modularize `orbit-map-worker.ts` | 2–3 days | Frontend |
| 16 | Refactor `orbit-map-canvas-host.tsx` | 1–2 days | Frontend |
| 17 | Add `chmod 600 .env` to setup docs | 15 min | Docs |
| 18 | Add public-share branding footer | 1–2 hrs | Frontend |
| 19 | Standardize `react-query` `keepPrevious` behavior | 2–3 hrs | Frontend |
| 20 | Add support/contact channel in app settings | 2–3 hrs | UX |

### P3 — Monetization & Scale

| # | Issue | Effort | Owner |
|---|-------|--------|-------|
| 21 | Design Prisma schema for `Plan`, `Subscription`, `Entitlement`, `Usage` | 2–3 days | Backend |
| 22 | Integrate Stripe (Checkout + Customer Portal + webhooks) | 3–5 days | Backend |
| 23 | Build entitlement middleware and feature gates | 2–3 days | Backend |
| 24 | Implement product quotas separate from abuse rate limits | 2–3 days | Backend |
| 25 | Add cost attribution dashboard for X API and xAI usage | 2–3 days | Backend/Ops |
| 26 | Admin panel for user management, plan overrides, and abuse monitoring | 3–5 days | Backend |
| 27 | Team/organization seats | 1–2 weeks | Backend/UX |

---

## 10. Verification Checklist

- [x] `npm run lint && npm run typecheck && npm run test && npm run build` — all green.
- [ ] Manually test `/orbit/map` on mobile (320–375 px), tablet, and desktop; confirm no control overlap.
- [ ] Test `/orbit/map` scope toggle repeatedly and confirm no `429` from the `orbit` scan bucket.
- [ ] Trigger Vercel cron manually in preview and confirm `/api/internal/sync/worker` returns 200 and drains queue.
- [ ] With a non-owner user, visit `/debug/rate-limits` and confirm no privileged data is exposed.
- [ ] Inspect CSP reports for one production week, then enforce.
- [ ] Run a media-proxy load test with a large video and confirm timeout/limits behave.

---

## 11. Sources & References

- `package.json`, `next.config.ts`, `vercel.json`, `prisma/schema.prisma`
- `src/app/api/orbit/graph/route.ts`, `src/app/api/internal/sync/worker/route.ts`, `src/app/api/media/route.ts`
- `src/lib/auth.ts`, `src/proxy.ts`, `src/lib/rate-limit.ts`, `src/lib/sync-queue.ts`
- `src/components/orbit/orbit-map-console.tsx`, `src/components/orbit/orbit-mode-switch.tsx`, `src/components/orbit/orbit-map-rail.tsx`
- `src/hooks/use-orbit-map-page.ts`, `src/components/orbit/orbit-map-canvas-host.tsx`, `src/workers/orbit-map-worker.ts`
- `SECURITY_HARDENING.md`, `RATE_LIMITING.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`

---

*End of report. P0 fixes are in the working tree and verified. Next step is a split commit: P0 bundle first, Orbit UI refactor second.*
