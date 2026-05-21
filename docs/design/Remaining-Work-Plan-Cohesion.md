# Remaining Work Plan for Final Cohesion — Orbital Theme (Futuristic Minimalism)

**Date:** 2026-05-19  
**Context:** Master Unification Plan (IMPL b6793308). Orbital primitives + thin reusable components (`@/components/orbital`) are established as the single authoring contract. Theme toggle is now first-class (Settings, user-nav, command palette). **Orbit triage** uses the clean list + right slide-in panel pattern (see `Orbit-List-SlideIn-Overlays-Implementation-Plan.md`); the retired two-column persistent inspector on `/orbit` is no longer the live model.

**Goal:** Every surface under `data-theme="orbital"` must feel like one calm, precise personal orbital intelligence system. Default production experience remains completely untouched.

---

## 1. Structural Cohesion — Extend Two-Column Mission Control to Main Feed (Highest Structural Priority)

**Current State:** `/orbit` uses list + slide-in review (not a persistent two-column inspector). Two-column mission control is planned for the **main dashboard/library feed** (`bookmarkFeedColumnClassName`), which remains single-column today.

**Recommended Plan (from Structural Cohesion Planner subagent):**

**Prioritized Steps (small, reviewable increments):**

1. **Foundation & State Alignment**
   - Strengthen `activeBookmarkIdForView` + selection flow in `src/app/(main)/dashboard/page.tsx` and `src/app/(main)/dashboard/bookmark-list.tsx`.
   - Add helper in `src/lib/bookmark-feed-layout.ts` for inspector-aware widths (`lg:max-w-[640px]` on left when active).
   - Files: dashboard files + layout helper.

2. **Introduce Library Inspector Component**
   - Create thin reusable pattern (recommended: `src/components/orbital/library-inspector.tsx` or inline using existing primitives).
   - Content tailored for library: title, metrics (TelemetryStat for likes/retweets/replies), tags/collections as `OrbitalBadge`, notes, quick actions (Add tag, Send to Orbit, etc.).
   - Must import only from `@/components/orbital`.

3. **Wire Two-Column Layout in Dashboard**
   - Conditional `lg:flex-row` wrapper around the list area exactly mirroring Orbit's pattern.
   - Left: constrained feed; Right: sticky `OrbitalCard` inspector.
   - Preserve existing Highlights/Digest above or integrate cleanly.
   - Respect view modes (suppress in grid).

4. **Polish, Accessibility, Theme Cohesion**
   - Live updates, focus management, mobile (sheet fallback), reduced-motion safe.
   - The panel automatically "lights up" only when global orbital theme is active.

5. **Broaden**
   - Apply same pattern to `collections/[id]/page.tsx`.
   - Light orbital telemetry treatment in PerformanceHighlights, HighlightsDigest, LibraryControlCenter, analytics.

**Exact Pattern to Reuse (from Orbit exemplar):**
```tsx
import { OrbitalCard, MissionControlHeader, TelemetryStat, OrbitalBadge } from '@/components/orbital';
```

Right inspector example (adapted from live Orbit code):
```tsx
{activeBookmark && (
  <div className="hidden lg:block lg:w-[380px] lg:shrink-0">
    <OrbitalCard className="sticky top-4 p-4 space-y-4 border-primary/20">
      <MissionControlHeader title="Satellite Inspector" ... />
      {/* title, TelemetryStat rows, badges, actions */}
    </OrbitalCard>
  </div>
)}
```

**Files:** `src/app/(main)/dashboard/page.tsx`, `bookmark-list.tsx`, `src/lib/bookmark-feed-layout.ts`, new inspector component, collection detail pages.

---

## 2. More Surfaces — Broader Polish & Consistency Sweep (High Visual Impact)

**Prioritized Remaining Surfaces (synthesized from Surface Auditors + previous momentum):**

**Tier 1 (Highest visibility / user time):**
- `src/app/(main)/dashboard/page.tsx` + `bookmark-list.tsx` (beyond two-col: headers, toolbars, PerformanceHighlights, HighlightsDigest)
- `src/components/library-control-center.tsx`
- `src/app/(main)/analytics/page.tsx` (charts, leaderboards, metric cards)
- Collection pages (`src/app/(main)/collections/page.tsx` and `[id]/page.tsx`)

**Tier 2 (Important for completeness):**
- All major dialogs/sheets (`add-tag-dialog`, `add-to-collection-dialog`, `orbit-review-dialog` & edit-sheet, `share-dialog`, etc.) — wrap panels, upgrade labels/metrics
- `src/app/(main)/settings/page.tsx` (beyond the new orbital toggle card)
- Filter panels, sort controls, empty states, error states
- `src/components/highlights-digest.tsx` and performance components

**Tier 3 (Supporting):**
- Landing page hero / auth flows (already has some OrbitalRings)
- Global chrome refinements (consistent PageHeader telemetry patterns)

**Pattern for every surface:**
- Import `{ orbital, OrbitalCard, TelemetryStat, MissionControlHeader, OrbitalBadge } from "@/components/orbital"`
- Replace ad-hoc `font-mono`, `rounded-2xl`, `sky-*`, raw tracking with `orbital.label / data / pill / badge / glass`
- Wrap panels in `OrbitalCard` where mission-control feel is appropriate
- No changes to default (non-orbital) experience

---

## 3. Switcher & Navigation Chrome Refinement (Discoverability & Polish)

**Current State:** Good coverage (Settings rich card + `OrbitalBadge`, user-nav quick item, command-palette actions with orbital styling).

**Recommended Next Refinements (from Switcher Refiner):**
- Full command palette "Actions" grouping with icons and better descriptions.
- Header / PageHeader quick orbital indicator or mini-toggle (subtle).
- Visual "Orbital Active" feedback in global chrome (e.g., special header treatment or badge when theme is on).
- Consistent "ON" / active states using `OrbitalBadge` everywhere.
- Keyboard shortcut documentation or hint for toggling orbital.

**Files:** `src/components/command-palette.tsx` (deeper grouping), `src/components/page-header.tsx` or user-nav, possibly a small `OrbitalStatusIndicator` component.

---

## 4. Paper & Visual Source-of-Truth Lock (Mandatory before final sign-off)

**Recommended Iteration Plan (from Paper Strategist — highest priority order):**

**Priority 1 (Switcher + Foundations)**
- New board: **"Orbital Theme Switcher — Discoverability & States"** (user-nav, Settings card, command-palette results with active states and copy).

**Priority 2 (Core + Proof)**
- Evolve **"Orbit Triage Workspace — Full (Cohesive v2)"** (richer cards, live effects, full primitives usage).
- New flagship: **"Product Cohesion Overview — Multi-Surface Orbital Theme"** (1440px wide, grid of 5–6 surface thumbnails under orbital: Landing, Orbit, Dashboard/Library, Collections, Analytics, Settings — with legend).

**Priority 3 (Broadening)**
- Landing/Auth hero with rings
- Dashboard/Library two-col slice
- Collections, Analytics, Global Chrome (PageHeader + Sidebar)

**Priority 4 (Polish)**
- Review dialogs/overlays, map/Pixi, Brand System evolution.

**Mandatory Checkpoints (every board + final pass):**
- All Paper Review Checkpoints (spacing, typography, contrast, alignment, fit, repetition)
- Orbital Theme Purity (no blue leaks, correct tokens/effects only)
- Typography enforcement (mono telemetry vs display)
- Two-column mission control consistency
- Switcher discoverability + active states
- Cross-surface parity

**Execution:** Small `write_html` + mandatory `get_screenshot` + one-line verdict per section. Use `duplicate_nodes` for efficiency on evolutions. End with full checklist.

---

## 5. Execution Order Recommendation (for next /implement)

1. **Structural** — Extend two-column to main dashboard feed (biggest cohesion leap).
2. **Switcher** — Finish command palette grouping + any header chrome polish.
3. **Paper** — Run the prioritized Paper iteration (switcher board → Cohesion Overview → surface boards).
4. **Broad Surfaces** — Systematic sweep of Tier 1–2 files using the established primitives (small batches per round).
5. **Final Polish** — Overlays, analytics, landing, consistency pass, reduced-motion, accessibility.

**Anti-Stagnation Rules for All Future Rounds:**
- Read this plan + latest summary first.
- Concrete code changes in the first 3–5 turns.
- Bounded scope per priority (one surface or one small feature).
- Always import from `@/components/orbital`.
- Update the summary with a new titled section at the end of every round.
- Stop after a reviewable increment.

---

**Success Criteria (Final Cohesion)**
- Any random screenshot under orbital theme is instantly recognizable as the same MarkMaster orbital intelligence system.
- Two-column mission control pattern is the default mental model for high-density views (Orbit + main feed + collections).
- Theme switcher is discoverable and delightful in multiple places.
- All Paper boards pass the full checklist and match live implementation.
- Zero legacy patterns remain in visual surfaces when the theme is active.
- Default (non-orbital) experience is byte-for-byte unchanged.

This plan completes the Master Unification vision. Ready for /implement execution in the order above.

**Single Source of Truth References:**
- `docs/design/Master-Unification-Plan-Futuristic-Minimalism.md`
- `src/components/orbital/index.ts`
- `src/app/globals.css` (orbital block)
- Live Orbit two-col implementation (`src/app/(main)/orbit/page.tsx`)
- Current Paper canvas ("Enthusiastic valley")