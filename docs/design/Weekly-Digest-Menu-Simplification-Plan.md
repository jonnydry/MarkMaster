# Weekly Digest Menu Simplification — From Cumbersome Expanded State to Lightweight Ritual On-Ramp

**Status:** READY FOR /implement  
**Date:** 2026-05 (synthesized from subagent deliberation)  
**Owner:** Grok + user directive  
**Related:** Master-Unification-Plan, Remaining-Work-Plan-Cohesion, flywheel instrumentation (Phase 3 Item 12)

---

## Executive Summary

The "Weekly digest" section (embedded inside the Discovery frosted card on Dashboard/Collections) becomes cumbersome when expanded: a nested `DiscoveryBatchBar` (dense stats + 3 CTAs + optional inner expand) + "extras" label + `HighlightScrollStrip` of `HighlightCard`s creates excessive vertical density, triple-nested chrome, and diluted primary action right above the main bookmark feed.

**Root cause:** The surface tries to be both (a) an educational/serendipitous preview of the curated mix and (b) the entry point to the batch Orbit ritual. These goals conflict in a space-constrained dashboard header.

**Core insight from UX + Product + Design subagents:** The *only* high-ROI behavior is the batch ritual ("Review all X together" → `/orbit?digestIds=...&source=weekly-gems`), which trains the flywheel. Quick picks already provide high-performer visibility. Individual extras cards and verbose stats deliver low marginal value at high UI cost.

**Decision:** Ruthlessly simplify the *embedded* expanded state to a minimal ritual on-ramp (single prominent CTA + one-line status). Defer all card browsing and deep list to the Orbit batch experience (already first-class). Preserve 100% of curation logic, telemetry, save-as-collection, celebration, standalone `HighlightsDigest` paths, and non-embedded surfaces.

This directly addresses the user's "still kind of cumbersome when expanded" complaint while *increasing* flywheel activation.

---

## Current State Analysis (Synthesized)

**Primary surfaces:**
- `DashboardDiscovery` (dashboard + collections pages): frosted card → Quick picks strip → embedded `WeeklyDigestPanel` (chevron toggle + body).
- Standalone: `HighlightsDigest` → full `WeeklyDigestPanel` (used on collections detail? and other contexts).

**When expanded (embedded=true + digestOpen):**
- `DiscoveryBatchBar`: "Batch review this week's mix" + long metrics line (count, overlap, resurfaced, engagement, nurtured) + flex of ghost/outline buttons + optional "See all N gems".
- Conditional "X gems not shown in Quick picks" + `HighlightScrollStrip` (or single card).
- All inside `WeeklyDigestPanel` body + outer Discovery card.

**Files carrying weight:**
- `src/components/weekly-digest-panel.tsx` (embedded toggle 214-236, body 161-211, curation memo, nurtured localStorage, celebration).
- `src/components/discovery-batch-bar.tsx` (62-102: the dense p-4 box + stats + multi-CTA).
- `src/components/dashboard-discovery.tsx` (169-181: decides embedding + passes excludeIds).
- `src/lib/weekly-gems-curation.ts` (capping + deduping — keep unchanged).
- Supporting: `highlight-scroll-strip.tsx`, `highlight-card.tsx`, `use-dashboard-discovery.ts`.

**Utility verdict (from subagent synthesis):**
- Strong intent and instrumentation (dedicated `cta.digest_review_together`, `digest.session_start`, conversion rate in analytics).
- Weak ROI for the expanded preview chrome: duplicates Quick picks patterns, adds decision fatigue before library triage, poor mobile stack.
- Best leverage: make the on-ramp *lighter* so more users actually reach the Orbit ritual.

---

## Guiding Principles for the Change

1. **Ritual > Menu.** The weekly gems exist to get users *into* a high-quality Orbit batch session. The dashboard surface should feel like a doorway, not a second feed or action menu.
2. **Dashboard is for Quick Picks + Library.** Do not compete with the main `BookmarkList` for vertical attention.
3. **Orbit owns the depth.** Full curation list, individual reviews, resurfaced labels, etc. belong in the batch context (already wired via `digestIds` + `activeDigestBookmarkIds` in `orbit/page.tsx`).
4. **Preserve all contracts.** Curation, telemetry events, `onSaveAsCollection`, celebration, `defaultCollapsed`, `embedded` prop, standalone usage, orbital theme compatibility, mobile, a11y.
5. **Measure what matters.** Existing flywheel events are sufficient; simplification should improve (or hold) `digestCtaToSessionRate` and absolute sessions while reducing friction proxies.
6. **Small, reviewable increments.** One focused PR for the embedded simplification; follow-ups only if metrics or qualitative feedback demand.

---

## Recommended Design: Ultra-Light Ritual On-Ramp (Primary: "Ritual Portal Row" + "Compact Tile" evolution path)

**For embedded mode (the painful case):**

When `digestOpen && embedded`:
- Keep the existing chevron header + Sparkles + "Weekly digest" + collapsedSummary (excellent affordance).
- Replace the entire current body with a single slim horizontal row (~52-64px):
  - Left: subtle one-line status (e.g. "12 gems · 3 resurfaced · ~2.4k engagements").
  - Right: two CTAs only — prominent primary button "Review all 12 together" (or "Begin weekly ritual in Orbit"), small secondary ghost/outline "Save as collection".
- No `DiscoveryBatchBar` box, no metrics paragraph, no "extras" label, no `HighlightScrollStrip`, no inner expand, no per-card actions in this surface.
- On primary CTA click: same celebration banner (reused or slimmed) + `handleReviewInOrbit` (existing logic + telemetry).
- Celebration + save toast remain.

**Visual / spacing targets:**
- Use existing `space-y-2` or tighter padding inside the Discovery card padding.
- In orbital theme: optional subtle ring or glow treatment on the primary CTA for ritual emphasis (import from `@/components/orbital`).
- Mobile: stack or tighter wrap; primary CTA gets more weight.

**Standalone / non-embedded (HighlightsDigest, no Quick picks case):**
- Keep richer presentation for now (or a slightly condensed version of the old bar). These surfaces have more room and different intent. Future phase can apply similar simplification if desired.

**Deferred access to gems (if power users complain about lost serendipity):**
- Future cheap addition: "Peek mix" link opens a lightweight non-modal sheet or popover listing titles + resurfaced labels (no heavy cards). Primary batch CTA still lives on the surface.

**Interaction notes:**
- Toggle (`setDigestOpen`) behavior unchanged.
- `expanded` state and its effect on curation only used for standalone or removed from embedded.
- All existing `trackFlywheelEvent`, router pushes, `onSaveAsCollection` calls untouched.
- `nurturedCount` localStorage + celebration retained (ritual reinforcement is valuable per product subagent).

---

## Implementation Plan (Phased, Small Increments)

### Phase 0 — Prep (low risk, can land early)
- Add a new prop or internal flag `minimalOnRamp?: boolean` to `WeeklyDigestPanel` (default false for backward compat).
- Document the intent in a short comment block at top of `weekly-digest-panel.tsx` and `discovery-batch-bar.tsx`.

### Phase 1 — Core Simplification (the shippable PR)
**Goal:** Make embedded expanded state feel light and ritual-focused. One reviewable diff.

**Exact changes:**

1. **weekly-digest-panel.tsx**
   - In the embedded branch (`if (embedded)`), when `digestOpen`, render a new minimal body instead of the current `<div className="space-y-4">` + `DiscoveryBatchBar` + extras strip.
   - New minimal body (inline or extracted tiny component `DigestRitualOnRamp`):
     - One-line status using existing `curation` + `totalEngagement` values (reuse `collapsedSummary` style or similar).
     - Flex row of CTAs: primary calls existing `handleReviewInOrbit`, secondary calls `handleSaveAsCollection`.
     - Reuse celebration rendering (the emerald banner block can stay above the row or be triggered the same way).
   - Conditionally skip rendering `DiscoveryBatchBar` and the `showExtrasStrip` / single-card block when `embedded`.
   - Keep `expanded` / `setExpanded` only for non-embedded or delete the toggle from embedded (simplest: hide the expand button when embedded).
   - Preserve the `!hasGems` empty state in both modes.
   - Update the header button classes slightly for tighter spacing if needed.

2. **discovery-batch-bar.tsx**
   - No breaking changes. It can remain for standalone use or be internally slimmed later.
   - Optionally add a `compact` variant prop that renders only the CTA row (for future reuse). For Phase 1, the embedded path simply stops using it.

3. **dashboard-discovery.tsx**
   - No functional change required. The `embedded={showQuickPicks}` and `defaultCollapsed` already drive the right behavior. Optional: pass `minimalOnRamp` explicitly for clarity.

4. **Minor cleanups (same PR)**
   - Remove or comment the now-unused "extras" label + scroll strip rendering path for embedded (dead code elimination after simplification).
   - Ensure `filterDigestDisplayGems` and curation still run (they do — needed for `allGems` count in CTA label and the Orbit payload).
   - Keep `handleOrbitReview` for individual cards (only used in non-embedded path now).

**Files touched (minimal surface):**
- `src/components/weekly-digest-panel.tsx` (primary)
- `src/components/discovery-batch-bar.tsx` (optional compact variant or no-op)
- `src/components/dashboard-discovery.tsx` (tiny prop pass if desired)
- Possibly update any tests that assert on the old DOM structure inside embedded digest.

**Testing surface:**
- Dashboard with/without Quick picks, with/without digest gems.
- Collections page (uses flush variant + DashboardDiscovery).
- Mobile viewport.
- Orbital theme + default theme.
- Click paths for both CTAs (verify telemetry, celebration, navigation, save dialog).
- Keyboard (focus, enter, escape on any future sheet).
- Reduced motion.

### Phase 2 — Polish & Measurement (post-ship, only if needed)
- If metrics show desire for light serendipity: add "Peek mix (N)" that opens a tiny sheet with titles only (reuse existing curation data; cheap).
- Tighten orbital-themed styling on the primary CTA.
- Consider deprecating the inner `expanded` toggle entirely for embedded.
- Add one lightweight impression event for the new on-ramp if attribution needs strengthening (only if product asks).

### Phase 3 — Broader (future, conditional on data)
- Apply similar minimal treatment to standalone `HighlightsDigest` if it starts feeling heavy on collections pages.
- Move weekly gems curation + batch entry fully inside Orbit as a first-class "This Week's Ritual" queue (aligns with long-term vision from all subagents). Dashboard becomes pure quick signal.

**Rollback:** Trivial — the old body rendering is a conditional; we can restore the previous JSX in < 5 min.

---

## Success Criteria & Guardrails

**Primary (flywheel health — using existing analytics):**
- `flywheelDigestCtaToSessionRate` holds or improves (+5-15pp target).
- Absolute `flywheelDigestSessions` / WAU stable or up.
- No regression in overall flywheel signals per user (`feedback.*` + `quick.keep` + modes).

**UX / Qualitative:**
- Dashboard feels noticeably lighter above the bookmark list (visual QA + user feedback).
- "Weekly digest" toggle no longer creates a tall nested block.
- Primary ritual CTA is the most obvious interactive element when the section is open.

**Technical:**
- Zero behavior change for:
  - Curation output or `allGems` payload passed to Orbit.
  - Save-as-collection flow.
  - Telemetry events and payloads.
  - Standalone `HighlightsDigest` rendering.
  - Mobile, a11y, themes.
- Build + typecheck + existing vitest pass.
- No new runtime dependencies.

**Anti-goals (do not do in this work):**
- Change curation heuristics.
- Alter Orbit digest session UX (unless a tiny follow-up).
- Touch Quick picks / PerformanceHighlights.
- Introduce new heavy components or modals in Phase 1.

---

## Open Questions (for user / post-implement review)

1. Should the primary CTA label be "Review all N together" (current) or "Begin weekly ritual in Orbit" (more evocative per design subagent)?
2. Keep the `nurturedCount` celebration banner in the slim row, or move the gamification entirely inside Orbit?
3. Do we want a "Peek" affordance in v1, or ship pure minimal and add only on request?
4. After Phase 1 lands and metrics are reviewed, should we schedule a follow-up to evaluate moving the whole concept inside Orbit (Phase 3 vision)?

---

## References & Subagent Inputs

- UX subagent (friction list + Direction #1 recommendation): collapsed disclosure + single prominent CTA, remove extras strip from embedded.
- Product subagent (Option B): ruthlessly simplify to minimal on-ramp; B before C; success metrics tied to existing flywheel events.
- Design subagent (Ritual Portal Tile A + Ultra-Compact Row C as top; minimal viable = slim CTA row): zero or near-zero added vertical, elevate ritual, defer lists to Orbit.
- Key code: `weekly-digest-panel.tsx:169-210`, `discovery-batch-bar.tsx:62-101`, `dashboard-discovery.tsx:169-181`, `weekly-gems-curation.ts:28-33`, `flywheel.ts:24`, `analytics/route.ts:277-283`, `orbit/page.tsx:724-752` (digest batch entry).

**This plan is the direct synthesis of the three subagent deliberations + codebase analysis. It is bounded, measurable, and faithful to the product's orbital ritual philosophy.**

Ready to `/implement`.

---

*Generated after parallel subagent deliberation on 2026-05. Do not expand scope beyond the embedded simplification without new explicit user directive.*