# Security Hardening — Phase 3

**Status**: In Progress  
**Started**: After completion of Orbit Map Web Worker performance work (April 2026)

## Goals

- Strengthen the application's security posture with minimal breakage to functionality and developer experience.
- Focus on high-impact, high-risk areas first.
- Use the existing excellent tooling (CSP reporting + `/debug/rate-limits` page) for data-driven decisions.
- Document all trade-offs clearly.

## Subphases

### Subphase 1: CSP Audit & Tightening (Current)

**Objective**: Move from a permissive policy (heavy use of `'unsafe-inline'`) to the strictest practical policy for a Next.js 16 + Tailwind + Web Worker application, using real violation data.

**Key Challenges Identified**:
- Inline `<script>` in root layout for instant dark mode (prevents FOUC).
- Tailwind v4 + shadcn/ui + CSS variables make removing `'unsafe-inline'` from `style-src` extremely difficult without major architectural changes.
- PixiJS Web Worker uses `blob:` worker scripts (already allowed).
- Turbopack in development requires `'unsafe-eval'`.
- Current setup has both enforcing CSP and CSP-Report-Only with nearly identical policies (suboptimal for auditing).

**Current Policy Location**: `next.config.ts`

**Tools Available**:
- `/api/csp-report` endpoint (stores last 50 violations)
- `/debug/rate-limits` page (shows both rate limits and CSP violations in one place)

## Subphase 1 Detailed Findings

### Current CSP Configuration Problems (next.config.ts)

**1. Broken Dual-Header Setup (Highest Priority Fix)**
- The config currently sets **both** `Content-Security-Policy` (enforcing) **and** `Content-Security-Policy-Report-Only`.
- Both headers contain almost identical policies.
- This means the browser **enforces** the rules while also sending reports. This defeats the purpose of "Report-Only" mode for safe auditing.
- The Report-Only value also has a duplicated `report-to default;`.

**2. Known Inline Script Requirement**
- `src/app/layout.tsx` (lines 41-45) contains one `dangerouslySetInnerHTML` script for instant theme initialization:
  ```html
  <script dangerouslySetInnerHTML={{ __html: "(function(){try{var t=localStorage.getItem('markmaster-theme')||'dark';..." }} />
  ```
- This is the main reason broad `'unsafe-inline'` is currently required on `script-src`.
- No other `dangerouslySetInnerHTML` or `eval`/`new Function` usage exists in the codebase.

**3. Style-src Reality**
- Tailwind CSS v4 + shadcn/ui components + dynamic CSS variables make removing `'unsafe-inline'` from `style-src` impractical without significant refactoring (custom PostCSS plugin + nonce propagation).
- This is an accepted limitation for most modern Next.js + Tailwind applications in 2026.

**4. Worker Requirements (Orbit Map)**
- The new high-performance PixiJS worker (`orbit-map-worker.ts`) is loaded as a module worker and often becomes a `blob:` URL at runtime.
- Current policy correctly allows `worker-src 'self' blob:` — this must be preserved.

**5. Development vs Production**
- `'unsafe-eval'` is already correctly gated behind `isDev`.
- Turbopack + React Fast Refresh require it in development.

### Realistic Tightening Strategy

Given the constraints of a real production app (Next.js App Router, Tailwind, component libraries, Web Workers, instant theme switching), the following is the **practical maximum strictness**:

- **script-src**: Move toward `'self' 'strict-dynamic'` + nonce (or hash for the known theme script) in production. Keep `'unsafe-inline'` as fallback during transition.
- **style-src**: Keep `'self' 'unsafe-inline'` (pragmatic reality).
- **worker-src**: Keep `'self' blob:` (required).
- Use **Report-Only** as the primary mechanism during the hardening phase.
- Remove the confusing dual enforcing + report-only setup.
- Eventually provide a clean enforcing policy for production once data confirms it is safe.

**Plan**:
1. Analyze current policy and known inline script requirements.
2. Clean up the dual-header configuration (make Report-Only the primary tool).
3. Propose a tightened but realistic policy.
4. Switch primary mode to Report-Only for safe data collection.
5. Implement changes and test across major flows (login, sync, Orbit map, AI scan, collections).
6. Decide on nonce/hash strategy vs pragmatic `'unsafe-inline'` acceptance for production.

---

## Subphase 1 — Changes Made

### Change 1: Fixed CSP Header Strategy (next.config.ts)

**Problem**: The previous configuration set both an enforcing `Content-Security-Policy` and a `Content-Security-Policy-Report-Only` with nearly identical values. This caused the policy to be enforced immediately while also trying to use Report-Only for auditing — defeating the purpose of safe data collection.

**Solution**:
- Made `Content-Security-Policy-Report-Only` the **only active CSP header** during the hardening phase.
- Commented out the enforcing header with clear instructions on when to re-enable it.
- Improved comments explaining the rationale (Tailwind reality, theme script, Pixi worker requirements, Turbopack).
- Preserved `worker-src 'self' blob:` (critical for the new Orbit Map Web Worker).

**File**: `next.config.ts` (securityHeaders section)

**Impact**: The application now runs with CSP reporting enabled but **no enforcement**. All violations will be collected safely via the existing `/api/csp-report` endpoint and visible on `/debug/rate-limits`.

**Next Steps for Data Collection**:
1. Start the dev server.
2. Use the application normally (especially the Orbit map, sync, AI scan, and login flows).
3. Visit `/debug/rate-limits` to see any reported violations in real time.
4. Once we have data, we will decide on the next tightening steps (e.g., adding a hash for the theme script or moving to nonces).

This completes the foundational cleanup for Subphase 1.

---

## Subphase 2: Input Validation & API Hardening

### Validation Coverage Audit (Completed)

I performed a full audit of every API route that accepts user-controlled input (JSON bodies or query parameters).

**Summary of Findings:**

| Route | Input Type | Validation Status | Risk Level | Notes |
|-------|------------|-------------------|------------|-------|
| `POST /api/bookmarks/sync` | None (fire-and-forget) | Good (no body) | Medium | Rate limiting + advisory locks are the main protections. No user input to validate. |
| `POST /api/orbit/scan` | JSON body | **Good** | High | Uses `orbitScanRequestSchema` (defined in `orbit-grok.ts`) with discriminated union for "scan" vs "apply". |
| `GET /api/orbit/graph` | Query param (`nodeCap`) | **Weak** | Medium-High | Manual `parseNodeCap` function. No Zod schema. User can influence expensive graph generation. |
| `GET /api/orbit/status` | Query param (`lastFailure`) | Good | Low | Very narrow whitelist (`xai_auth`, `xai_model`). Safe. |
| `POST /api/bookmarks` (delete) | JSON | Good | Medium | Uses `deleteBookmarkSchema` from central validations. |
| `POST/PATCH /api/collections` | JSON | Good | Medium | Uses `createCollectionSchema` / `patchCollectionSchema`. |
| `POST/PATCH/DELETE /api/collections/[id]/items` | JSON | Good | Medium | Uses central `bookmarkTargetSchema`, `reorderCollectionItemsSchema`. |
| `PATCH /api/collections/[id]` | JSON | Good | Low-Medium | Uses `patchCollectionSchema`. |
| `POST /api/tags` | JSON | Good | Low | Uses central schemas. |
| `POST /api/notes` | JSON | Good | Low | Uses central schemas. |
| `GET /api/export` | Query | Good | Low | Uses `exportQuerySchema`. |
| `POST /api/csp-report` | JSON | N/A | Low | Designed to accept arbitrary reports. Internal. |

**Key Observations**:

- **Core bookmark/collection/tag/note flows** have solid Zod coverage in `src/lib/validations.ts`.
- **Orbit scan** has good validation, but the schema lives in `src/lib/orbit-grok.ts` instead of the central file (minor consistency issue).
- **Biggest gap**: `GET /api/orbit/graph` uses ad-hoc number parsing instead of a Zod schema. This is the clearest hardening opportunity in Subphase 2.
- No routes were found to be completely unprotected against malformed input.

**Recommended Actions**:
1. Add proper Zod schema for Orbit graph query parameters (`nodeCap`).
2. Consider moving `orbitScanRequestSchema` (and related) into `validations.ts` for centralization.
3. Add lightweight validation to any remaining ad-hoc parsing.
4. Ensure all future routes follow the "parse with Zod → return 400 on failure" pattern.

### Changes Made in Subphase 2

#### Change 1: Added Zod schema for Orbit Graph query parameters

- Created `orbitGraphQuerySchema` + related constants in `src/lib/validations.ts`:
  ```ts
  export const orbitGraphQuerySchema = z.object({
    nodeCap: z.coerce.number().int().min(1).max(4000).default(1500).optional(),
  });
  ```
- Updated `src/app/api/orbit/graph/route.ts`:
  - Replaced ad-hoc `parseNodeCap()` function with proper Zod validation.
  - Uses `safeParse` on query parameters.
  - Falls back gracefully to the safe default on invalid input.
- Imported `DEFAULT_ORBIT_GRAPH_NODE_CAP` for consistency.

**Benefit**: The most expensive read path in the Orbit system now has the same strict validation standard as the rest of the app. Invalid `nodeCap` values are rejected cleanly instead of relying on manual number parsing.

---

### Remaining Work in Subphase 2

- [ ] Consider migrating `orbitScanRequestSchema` and `orbitScanPlanSchema` from `orbit-grok.ts` into the central `validations.ts` for better organization.
- [ ] Add validation to any new routes that may be added in the future.
- [ ] Light review of test coverage for validation error paths (already reasonably tested in several `.test.ts` files).

Subphase 2 is now in good shape. The highest-value gap (Orbit graph) has been closed.

---

### Subphase 2: Input Validation & API Hardening

**Objective**: Ensure every public API route has strict, well-tested input validation.

**Focus Areas**:
- High-risk routes: `/api/bookmarks/sync`, `/api/orbit/scan`, `/api/collections`
- Review and strengthen `src/lib/validations.ts`
- Add missing schemas where needed
- Ensure proper error handling and sanitization

**Status**: Pending

---

### Subphase 3: Header / Auth / Middleware Final Polish

**Objective**: Review and tighten remaining security headers, cookies, and middleware logic.

**Focus Areas**:
- `src/lib/auth.ts` (NextAuth cookie configuration) — **Completed**
- `src/proxy.ts` (rate limiting + JWT extraction) — **Completed** (critical JWE decryption bug fixed)
- Security headers in `next.config.ts` — **Completed**

**Status**: Completed

#### Changes Implemented

**Auth Cookies (`src/lib/auth.ts`)**:
- Fully hardened **all** Auth.js cookies with `httpOnly`, `Secure`, proper `__Secure-` / `__Host-` prefixes, and `sameSite: "lax"`.
- Added `useSecureCookies` and reduced session `maxAge` from 30 days to 14 days.
- Exported `getSessionCookieName()` and `getUserIdFromRequest()` (correct JWE handling).

**Proxy (`src/proxy.ts`)**:
- Fixed the critical bug where per-user rate limiting was completely broken (`jwtVerify` was used on JWE-encrypted Auth.js sessions).
- Now correctly uses the JWE decryption helper from `auth.ts`.
- Improved IP extraction and removed dead code.

**Security Headers (`next.config.ts`)**:
- Added `Reporting-Endpoints` header.
- Tightened `script-src` by replacing `'unsafe-inline'` with a SHA-256 hash of the theme initialization script.
- Significantly expanded `Permissions-Policy`.
- Extracted theme script to `src/lib/theme-init.ts` for maintainability.

---

### Subphase 4: Final Security Review + Documentation

**Objective**: Comprehensive review of all changes made during Phase 3, validation that the build is clean, and final documentation of the security posture.

**Status**: Completed

#### Final Review Summary (as of April 2026)

After completing Subphases 1–3 and performing an extensive multi-agent bughunt across the codebase, the following was achieved:

**Key Wins in Phase 3**:
- **CSP Strategy**: Moved to a clean Report-Only posture with `Reporting-Endpoints` header. Tightened `script-src` by replacing broad `'unsafe-inline'` with a SHA-256 hash for the single theme initialization script. Significantly expanded `Permissions-Policy`.
- **Auth Cookies**: Fully hardened all Auth.js cookies (`sessionToken`, `csrfToken`, `pkceCodeVerifier`, `state`, `nonce`, etc.) with proper `httpOnly`, `Secure`, `__Secure-`/`__Host-` prefixes, and `sameSite: "lax"`. Session lifetime reduced from 30 days to 14 days for better security.
- **Proxy / Rate Limiting**: 
  - Switched to the modern Next.js 16 `proxy.ts` convention (exporting `proxy`) for rate limiting + JWE session extraction.
  - Fixed a critical bug where per-user rate limiting was completely broken (was using JWS verification on JWE-encrypted Auth.js sessions).
  - Made rate limiting resilient with lazy initialization and fail-open behavior when Upstash Redis is unavailable.
  - Removed abandoned/dead rate-limiting code (`rate-limiter.ts`).
- **Input Validation**: Completed audit and strengthened the most exposed route (`/api/orbit/graph`).
- **Build & Stability**: Performed a large-scale bug hunt and fixed dozens of TypeScript, import, message protocol, and d3-force issues (especially in the Orbit Map worker). The project now produces a clean production build.

**Build Status**: ✅ Clean (`npm run build` succeeds with no TypeScript errors).

**Current Recommended Posture**:
- CSP **mode is env-driven** via `CSP_MODE` (defaults to Report-Only). Collect real usage data via `/debug/rate-limits`, then set `CSP_MODE=enforce` in the production environment to serve an enforcing `Content-Security-Policy` header. Flip back to `report-only` at any time for instant rollback — no code change required.
- The global rate-limiter resolves the client IP via `getClientIp` (`src/lib/client-ip.ts`), which ignores client-spoofable `x-forwarded-for` hops. Set `TRUSTED_PROXY_HOPS` to match your deployment's proxy chain (default 1 for Vercel/Cloudflare/single proxy; 0 if the app is directly exposed).
- All other security headers are active and production-appropriate.
- Auth cookies are properly hardened.
- Rate limiting is active and resilient.
- Internal debug tools (`/api/debug/rate-limits`, `GET /api/csp-report`) fail **closed** in production: they require `OWNER_USER_ID` to be set and to match the caller, otherwise they return 404.

#### Completed Hardening Checklist

- [x] CSP Report-Only strategy implemented with proper reporting endpoint
- [x] `Reporting-Endpoints` header added
- [x] Script-src tightened with SHA-256 hash for theme script
- [x] Permissions-Policy significantly expanded
- [x] All Auth.js cookies explicitly hardened
- [x] Session maxAge reduced to 14 days
- [x] Proxy (`src/proxy.ts`) properly wired following Next.js 16 convention (function named `proxy`)
- [x] Per-user rate limiting via JWE session extraction now functional
- [x] Rate limiting made fail-open and lazy
- [x] Dead rate-limiting code removed
- [x] Input validation audit completed
- [x] Major Orbit worker type and integration issues resolved
- [x] Clean production build achieved

#### Remaining Recommendations

1. **CSP Enforcement**: After heavy real-world usage (especially Orbit map + sync + collections), review violation reports in `/debug/rate-limits`. When clean, enable enforcement by setting `CSP_MODE=enforce` in the production environment (the header switches from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` automatically).
2. **Orbit Map Worker**: The two Pixi v8 `@ts-expect-error` suppressions have been removed by fixing the underlying API usage (`BitmapFontManager.ASCII` for the charset; `style.fontFamily` instead of the v7 `fontName` to reference the installed bitmap font). Remaining polish: incomplete event wiring could still use a dedicated pass before relying on the worker heavily.
3. **Rate Limiting Coverage**: All destructive/write API handlers now carry explicit per-user `api:write` limits (including `tags` DELETE/PATCH and `collections/[id]` DELETE, previously relying only on the proxy). Heavy reads (`/api/export`, `/api/analytics`, `/api/orbit/graph`) carry explicit `api:read` limits; lightweight CRUD reads continue to rely on the proxy-level limiter by design.
4. **Documentation**: Consider adding a short `docs/security.md` or expanding the README with the current security posture for open-source contributors.

---

**Phase 3: Security Hardening – Completed**

All major objectives of the Security Hardening phase have been achieved. The application now has a significantly stronger and more production-ready security posture while maintaining good developer experience (fail-open rate limiting, Report-Only CSP during transition, etc.).

The project is now in a good state to either:
- Move into the next major phase (if one was planned), or
- Focus on polishing the Orbit Map worker and collecting real CSP data before enforcing the policy.

**Status**: Pending

---

## Overall Progress

- [x] Orbit Map Web Worker performance work completed
- [ ] Subphase 1: CSP Audit & Tightening
- [ ] Subphase 2: Input Validation & API Hardening
- [ ] Subphase 3: Header / Auth / Middleware Final Polish
- [ ] Subphase 4: Final Security Review + Documentation

---

*This document will be updated after each subphase with findings, decisions, and changes made.*