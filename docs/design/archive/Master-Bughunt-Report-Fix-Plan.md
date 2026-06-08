# Master Bughunt Report & Fix Plan — Orbital Theme Cohesion

**Date:** 2026-05-19  
**Context:** Full 6-subagent review completed after the cohesion slice that added two-column mission control to the dashboard and polished the command palette. A focused P0 fix round immediately followed to correct the most severe regressions. This document consolidates all auditor findings into one actionable plan.

**Core Constraints (non-negotiable):**
- Default production experience (`:root` / `.dark`) must remain **byte-for-byte unchanged**.
- All futuristic minimalism visuals and behavior live exclusively under `data-theme="orbital"` + `.theme-orbital`.
- Every surface under the theme must author exclusively with the canonical primitives and thin components from `@/components/orbital`.
- Anti-stagnation rules: read the latest summary + this plan + `Remaining-Work-Plan-Cohesion.md` first; make concrete changes early; keep each /implement round bounded and reviewable; update the summary artifact with a titled section; stop after a solid increment.

---

## 1. Executive Summary

The orbital design language has a strong foundation (primitives barrel, theme provider, early script, CSS scoping, switcher in three places, two-column pattern proven in Orbit and now gated in the dashboard).

However, the "broader polish" and recent cohesion work introduced several regressions and left large surfaces untouched. The review identified **systemic issues** around theme isolation, data model mismatches, and incomplete adoption of the canonical authoring contract.

**Post-P0 Fix Round Status (as of now):**
- Dashboard two-column inspector is now properly gated behind the orbital theme.
- Bookmark field names in inspectors (dashboard + Orbit) are corrected.
- Command palette TDZ error is resolved; appearance actions work again.

**Remaining High-Impact Problems:**
- Large portions of the app (analytics, library-control-center, collections, performance highlights, dialogs) still use almost none of the orbital primitives.
- Orbit subcomponents (review dialog, strips, map rail, etc.) still contain heavy legacy `sky-*` colors and oversized rounded panels.
- No Paper boards have been created or updated to reflect the new dashboard inspector or switcher states.
- `OrbitalRings` was never promoted to the canonical barrel as originally planned.
- Many small but visible inconsistencies (rounding, tracking, hard-coded colors, icon treatment) remain.

---

## 2. Consolidated Findings by Category

### 2.1 Theme Isolation & Behavioral Leakage (Highest Risk)

- **Dashboard two-column** (pre-fix): Structural layout and inspector rendered unconditionally for all users.
- **Landing page**: `<OrbitalAuthExperience>` + `OrbitalRings` are permanent in the default public experience.
- **Primitives usage**: Some always-on effects (mono typography) are intentional, but layout decisions and certain visual treatments were being applied without proper `isOrbital` guards.
- **Hard-coded colors** inside mission-control components (`white/*`, `border-white/10`) only make sense under the orbital glass context.

**Status after P0 round:** Dashboard two-col is now gated. Landing rings remain an open question.

### 2.2 Incorrect Data Model Usage in Inspectors

- Both the new dashboard inspector and the Orbit inspector were using non-existent fields (`title`, `text`, `authorName`).
- Real shape (`BookmarkWithRelations`): `tweetText`, `authorDisplayName`, `authorUsername`, `publicMetrics`, etc.
- Result: inspectors were largely non-functional.

**Status:** Fixed in the P0 round.

### 2.3 Command Palette & Switcher Polish Debt

- TDZ / compile error on `handleOpenChange` (blocked the new appearance actions).
- Heading/group logic was position-based and broke once appearance actions were prepended.
- Dialog built-in close button (`X`) was still rendered and overlapped the custom UI.
- Focus model was mixed (virtual on input + real buttons).
- Orbital surface treatment was only partially applied (only action rows got glass).

**Status:** TDZ fixed. Remaining polish items (headings, X button, full surface treatment) are still open.

### 2.4 Large High-Traffic Surfaces Still Untouched

**Highest priority remaining surfaces (repeated across multiple auditors):**

| Surface                              | Current State                          | Recommended First Action                          | Impact |
|--------------------------------------|----------------------------------------|---------------------------------------------------|--------|
| `library-control-center.tsx`        | Zero primitives, amber banners         | `OrbitalCard` + `TelemetryStat` + `OrbitalBadge` | Very High |
| `analytics/page.tsx` + Recharts     | Heavy `ui/Card`, raw labels, legacy tooltips | Convert cards + metrics to primitives            | Very High |
| `performance-highlights.tsx` + Digest | Pervasive raw `font-mono` + tracking   | `OrbitalBadge` + `orbital.label`/`data`           | High |
| Collections (cards + detail)        | Legacy cards, no orbital treatment     | `OrbitalCard` + `OrbitalBadge` on status          | High |
| Major dialogs & sheets              | Raw panels, `MONO_STYLE` remnant in review sheet | `OrbitalCard` wrappers + primitive labels        | High |
| Orbit subcomponents (review, strips, map rail, mini-map, etc.) | Heavy `sky-*` + `rounded-2xl` leaks   | Replace with `orbital.*` + `OrbitalCard`          | High (flagship surface) |

### 2.5 Missing Canonical Components & Paper

- `OrbitalRings` still lives only inside `orbital-auth-experience.tsx` and was never moved to `@/components/orbital` with the planned props.
- No Paper boards created for:
  - "Orbital Theme Switcher — Discoverability & States"
  - "Product Cohesion Overview — Multi-Surface"
  - Updated "Orbit Triage Workspace — Full (Cohesive v2)"
  - Dashboard two-column slice

### 2.6 Cross-Cutting Polish Debt

- Inconsistent rounding (`rounded-2xl` vs required `rounded-sm` under orbital)
- Ad-hoc `tracking-[0.1–0.2]em` + uppercase labels instead of `orbital.label`
- Hard-coded `amber-*` / `note-*` warning banners
- Inconsistent use of `OrbitalBadge` vs raw chips
- Focus management and keyboard hints still weak in inspectors

---

## 3. Prioritized Fix Plan (Recommended /implement Batches)

Follow the anti-stagnation discipline on every round: read plans + latest summary first, concrete changes early, tiny bounded scope, update summary, stop after a reviewable increment.

### Batch 1 – Immediate Post-P0 Cleanup (High confidence, low risk)

- Fix remaining command-palette issues (heading logic, suppress Dialog X, improve clamp + focus model).
- Promote `OrbitalRings` to `@/components/orbital` with planned props + telemetry variants.
- Clean the most painful Orbit subcomponents (review dialog, focus/scan strips, map rail) — replace `sky-*` and large rounded panels.
- Update `MissionControlHeader` to stop using `border-white/10` (use theme-aware or hairline tokens).

**Suggested title for summary section:** "Bughunt Batch 1 – Palette Polish + OrbitalRings Promotion + Orbit Subcomponent Cleanup"

### Batch 2 – Highest-Visibility Daily Surfaces

- `library-control-center.tsx` (full primitive treatment + amber banner removal)
- `performance-highlights.tsx` + `highlights-digest.tsx`
- `analytics/page.tsx` + Recharts cards (convert to `OrbitalCard` + `TelemetryStat`)
- Collection cards (`collection-card.tsx`) + list/detail chrome

### Batch 3 – Dialogs, Sheets & Supporting Surfaces

- All major dialogs and sheets (wrap key panels in `OrbitalCard`, upgrade labels/metrics/pills)
- Filter panel, empty states, pagination, selection toolbar
- Settings cards beyond the toggle row

### Batch 4 – Structural Completion

- Two-column mission control in collections detail (`collections/[id]/page.tsx`)
- Light telemetry treatment in remaining dashboard chrome (if still needed after Batch 2)

### Batch 5 – Visual Source of Truth (Paper)

Execute the exact order from the plan:
1. New "Orbital Theme Switcher — Discoverability & States" board
2. "Product Cohesion Overview — Multi-Surface" (show dashboard inspector + current state)
3. Evolve "Orbit Triage Workspace — Full" to cohesive v2
4. Add dashboard two-col slice, collections, analytics, global chrome boards as needed

Run the full 6-checkpoint + "Orbital Theme Purity" + typography + two-col consistency reviews after each meaningful edit.

### Batch 6 – Final Polish & Consistency

- Remaining rounding/tracking/icon inconsistencies
- Focus management and keyboard hints in inspectors
- Hydration label flicker on toggles (nice-to-have)
- Any remaining `MONO_STYLE` or duplicate logic remnants
- Cross-surface visual parity check

---

## 4. Execution Guidelines

- **Always** start a round by reading:
  - Latest `/tmp/grok-impl-summary-b6793308.md`
  - `docs/design/Remaining-Work-Plan-Cohesion.md`
  - This document (`Master-Bughunt-Report-Fix-Plan.md`)
- Use **only** `import { orbital, OrbitalCard, ... } from "@/components/orbital"`
- Gate any layout or behavioral change behind `isOrbital`
- Prefer thin components over raw `cn(orbital.xxx, ...)`
- After every round, append a clearly titled section to the summary artifact.
- Stop after a reviewable increment — do not over-scope.

---

## 5. Success Criteria (End State)

- Any screenshot taken with `data-theme="orbital"` instantly reads as the same calm, precise personal orbital intelligence system.
- Default (non-orbital) experience is byte-for-byte identical to before any orbital work began.
- 100% of high-traffic surfaces author exclusively with the canonical primitives and thin components.
- Two-column mission-control pattern is the default mental model for dense views (Orbit + dashboard + collections).
- Theme switcher is first-class and delightful in Settings, user-nav, and command palette.
- All required Paper boards exist and pass the full checklist.
- `OrbitalRings` is a first-class reusable component in the barrel.

---

**This document is now the primary working reference for the remainder of the unification effort.**

Ready for the first post-P0 /implement batch whenever you are. Just tell me which batch (or a custom slice) you want to run next.