# Master Plan: Unified High-Engagement Discovery Carousel

**Status:** READY FOR /implement  
**Date:** 2026-05-26  
**Context:** Follow-up to Weekly-Digest-Menu-Simplification-Plan. Current Discovery card stacks two tiers (Quick picks strip + slimmed Weekly digest on-ramp). User directive: collapse into one carousel of highest-engagement items to reduce space and friction. Four expert subagents (IA, Interaction Design, Product/Retention, Technical) debated and largely converged.

---

## 1. Vision & Decision

**Goal:** Replace the two-tiered Quick picks + Weekly digest structure inside the main Discovery frosted card with **one unified, high-signal horizontal carousel** of the highest-engagement bookmarks. Preserve (and ideally strengthen) the reflective batch ritual that powers the flywheel.

**Core Principle (synthesized from all subagents):**
- One continuous discovery surface for "highest engagement."
- Smart internal signals (raw/untouched prioritized visually for triage speed + resurfaced/strong library for serendipity) instead of separate tiers.
- The **batch ritual** ("Review full mix in Orbit", nurturedCount, celebration, `digestIds` + `source=weekly-gems`) must remain a first-class, prominent affordance — not diluted into generic carousel browsing.

**Explicit Go Decision (with conditions):**
- **Go** on unification in the dashboard + collections flush "Discovery" card.
- **Conditional on ritual preservation:** The batch CTA must be more (or at least equally) salient than today. If the unified surface weakens `cta.digest_review_together` → `digest.session_start` conversion or nurtured ritual feeling, we roll back.
- Standalone / deeper surfaces (`HighlightsDigest`, non-embedded `WeeklyDigestPanel`, Collections detail pages) remain richer for now.

---

## 2. Synthesized Design (from Expert Debate)

### Surface Name & Copy
- **Inside the existing "Discovery" header** (Compass icon): "High performers" or "High-engagement mix".
- **Dynamic single-line subtitle:**  
  `N high-engagement • X untouched • Y resurfaced`
- Updated explainer (when no custom `explainer` prop): "Highest-engagement posts from your library — prioritized for review."

### Carousel Structure (6–8 items)
- Single `HighlightScrollStrip` (existing snap + dots + counter).
- **Ordering (IA + Technical consensus):** First 3–4 positions heavily biased toward raw untouched high-performers (fast triage value). Then inject 1–2 resurfaced (>30d) + remaining strong library items from the curation logic.
- **Visual distinction (Interaction + IA):**
  - Raw/untouched: crisp, "Fresh" or no badge, strong triage signal.
  - Resurfaced: "Resurfaced" badge (existing `itemLabel` mechanism) + subtle bronze/amber micro-treatment (clock icon, soft breathe on first appearance, left accent hairline between raw-dominant and mix sections on wide viewports).
- Reuse/extend `HighlightCard` with a `mixContext` or `slot` prop.

### Batch Ritual CTA (Critical — Product/Retention non-negotiable)
Two complementary affordances (Interaction recommendation + Product guardrail):

1. **Always-visible header pill** (right side of Discovery header row): "Review full mix in Orbit (N)" — primary ritual entry.
2. **Ritual Anchor as final slide** (the 7th/8th card): Visually distinct (orbital glass or elevated treatment), Sparkles, stats summary, prominent "Review full mix" button + tiny "Save as collection" secondary.

Both trigger the **exact existing** `handleReviewInOrbit` flow:
- `trackFlywheelEvent("cta.digest_review_together", { gems })`
- Celebration banner + `incrementNurtured`
- Router push: `/orbit?digestIds=...&source=weekly-gems`
- Full `ritualBatch` payload (preserves overlap logic for "N gems" copy).

"Save as collection" continues to use the full curated set via `onSaveAsCollection`.

### What Changes vs What Stays
**Changes (dashboard Discovery card only):**
- Remove the stacked `PerformanceHighlights` + `WeeklyDigestPanel` (embedded) inside `DashboardDiscovery`.
- Replace with single unified `DiscoveryCarousel` (or evolved `PerformanceHighlights` + thin wrapper).
- Centralize curation into `buildDiscoveryCarouselItems` (evolution of `buildWeeklyGemsCuration`).

**Preserve 100% (non-negotiable contracts):**
- All flywheel telemetry and source attribution (`highlights` for individual, `weekly-gems` for batch).
- `nurturedCount` localStorage + celebration.
- Exact Orbit batch handling (`digestIds`, `activeDigestBookmarkIds`, dedicated banner in review dialog).
- `onSaveAsCollection` signature and payload semantics.
- `usePerformanceHighlights(raw=...)` + performance SQL scoring + personalBoost + feedback boosts.
- `parentData` injection, `DashboardDiscovery` variants (`flush`), Collections page usage.
- Standalone `HighlightsDigest` + non-embedded `WeeklyDigestPanel` (richer experience on other surfaces).
- Individual card actions, deduping logic, and `?raw=true` vs library paths.

**Deletable/slimmable (dashboard context):**
- Embedded `DiscoveryBatchBar` + extras strip rendering logic (already heavily reduced in prior plan).
- Duplicative title/subtitle stacks.

---

## 3. Technical Architecture (Technical Subagent)

**Recommended incremental path (low risk):**

1. **Phase 1 (data layer):** Add `buildDiscoveryCarouselItems(rawGems, libraryGems)` in `weekly-gems-curation.ts` (returns flat ordered list + `ritualBatch` + slot metadata). Evolve `useDashboardDiscovery` (or new `useDiscoveryCarousel`) to expose the unified shape.
2. **Phase 2 (renderer):** Create thin `DiscoveryCarousel` (reuses `HighlightScrollStrip` + `HighlightCard`). Add minimal `mixContext` support to cards for visual treatments.
3. **Phase 3 (integration):** Update only `DashboardDiscovery` (default + flush) to render the single carousel + header pill + Ritual Anchor. Keep `WeeklyDigestPanel` import for standalone paths.
4. **Optional later:** Collapse to one API roundtrip (`?discovery=1`).

**Risks & Mitigations:**
- Dedup/overlap bugs in batch payload → Explicit `ritualBatch` derivation + narrow tests.
- Dilution of raw triage signal → Raw items front-loaded + visual priority treatments.
- Telemetry/source drift → Keep all existing `trackFlywheelEvent` call sites; only change rendering container.
- Collections / standalone breakage → No changes to those call sites or `HighlightsDigest`.

**Complexity:** Medium (3–5 focused days for clean slices). High confidence on contract preservation.

---

## 4. Success Criteria & Guardrails

**Must not regress (primary):**
- `flywheelDigestCtaToSessionRate`
- Absolute `flywheelDigestSessions` (normalized)
- Share of top entry sources from "weekly-gems"
- % of users who ever fire a batch CTA (ritual adoption)

**Desired outcomes:**
- Reduced vertical footprint in Discovery card (qualitative + any simple height measurement).
- Maintained or improved perceived clarity ("one clear high-signal surface").
- No increase in single-item vs batch review ratio in a way that harms curation quality.

**Phased rollout recommendation (from Product subagent):**
- Instrument any missing impressions if needed.
- A/B (current two-tier vs unified with strengthened ritual CTA) at 15–20% for 2–3 weeks.
- Gate on the rate + session volume before wider rollout.
- Post-ship qualitative pulse on "does the product still feel like it has a weekly ritual?"

---

## 5. Scope & Anti-Scope

**In scope for this plan:**
- Dashboard + collections flush "Discovery" card only.
- One unified carousel + header pill + Ritual Anchor CTA.
- Curation centralization + minimal card/strip polish for distinction.
- Full preservation of every flywheel, telemetry, Orbit, save, and variant contract.

**Explicitly out of scope (future phases only if metrics justify):**
- Touching standalone `HighlightsDigest` / non-embedded WeeklyDigestPanel.
- Changes to the performance SQL scoring or `usePerformanceHighlights` hook.
- New API endpoints (can be additive later).
- Full deletion of `WeeklyDigestPanel` or `DiscoveryBatchBar` (they remain for other surfaces).
- Major Orbit dialog changes.

---

## 6. Implementation Order (Small, Reviewable Increments)

1. Centralize curation helper + new hook shape (no UI change).
2. Build `DiscoveryCarousel` renderer + `mixContext` support in cards (behind flag or separate component).
3. Wire into `DashboardDiscovery` (replace the stack) + add header pill + Ritual Anchor as last slide.
4. Update copy, explainer, and any nearby docs.
5. Light polish (edge gradients, keyboard arrows on strip, reduced-motion guards).
6. A/B instrumentation + rollout per success criteria.

**Key files expected to change (high confidence):**
- `src/lib/weekly-gems-curation.ts`
- `src/hooks/use-dashboard-discovery.ts`
- `src/components/dashboard-discovery.tsx`
- `src/components/discovery-carousel.tsx` (new)
- Minor: `src/components/highlight-card.tsx`, `src/components/highlight-scroll-strip.tsx`, `src/components/weekly-digest-panel.tsx` (further slimming of embedded branches)

---

## 7. Subagent Convergence & Open Trade-offs

**Strong agreement:**
- Single carousel reduces space and cognitive load.
- Raw items should lead for triage speed.
- Visual (not sectional) distinction for resurfaced.
- Batch ritual CTA must be prominent and use the exact existing machinery.

**Product vs others tension (explicitly called out):**
- Product subagent is the most cautious on ritual dilution. The plan adopts their "conditional go" by making the batch CTA more salient (header pill + anchor card) than the current slim row.
- If A/B shows regression on the rate, we have a clear rollback path and the prior two-tier (or further ritual strengthening) as fallback.

**Open questions for post-implement review:**
- Exact CTA copy ("Review full mix in Orbit" vs "Begin weekly ritual — N gems").
- Whether the Ritual Anchor should be the *last* slide or a persistent floating treatment on very wide viewports.
- Long-term fate of the standalone `WeeklyDigestPanel` once the primary surface is unified.

---

**This plan represents the synthesis and negotiated agreement of the four expert subagents.** It is bounded, contract-preserving, measurable, and directly addresses the user's request for a streamlined single-carousel experience while protecting the core flywheel ritual that makes the product valuable.

Ready to `/implement`.

---

*Generated after parallel subagent deliberation. All four experts contributed concrete recommendations that are reflected above.*