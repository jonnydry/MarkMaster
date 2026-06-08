# Orbit Page Redesign: Clean List + Slide-in Review Panel + Contextual Overlays

**Status:** APPROVED DIRECTION — Proceed to implementation  
**Visual Source of Truth:** Paper artboards (local "Enthusiastic valley" file):
- 6U-0 — Orbit — Clean List View (Monospace Native)
- 7X-0 — Orbit — Slide-in Review Panel (Selected)
- HX-0 — Orbit — Contextual Overlays (Light Demo)

**Date:** 2026-05-19  
**Owner:** Grok (with user review gates)

---

## 1. Executive Summary & Goals

The rigid two-column inspector on `/orbit` has been retired in favor of a superior, production-intent pattern discovered through design exploration:

- **Primary surface**: A clean, high-density, scannable vertical list (the "Fresh Queue").
- **Deep review**: A lightweight **slide-in panel from the right** (460px glass panel) that opens when a row is selected. It contains Grok suggestion, tags, collections, and decisions.
- **Speed layer**: Extremely light **contextual/dynamic overlays** (compact floating menu + action pill) for in-flow quick actions without leaving the list.

This matches the exact visual language locked in the three Paper artboards:
- Deep void + cyan-teal (`#5CE1C7`) as the living orbital glow + warm bronze (`#C9AA6C`) accents.
- **3-tier monospace-native typography** as the default voice (when the global Monospace UI toggle is active):
  1. JetBrains Mono (Bold/ExtraBold) — display, large metrics, headers.
  2. IBM Plex Mono (Regular + Medium) — UI labels, reasoning, navigation, card titles.
  3. JetBrains Mono (Regular) — data, timestamps, counts, tabular figures.
- Extreme restraint, perfect alignment, glassmorphism with inner glow, high craft.

**Primary Goal**: Make the `/orbit` page feel like a first-class mission-control triage workspace — calm, precise, fast, and unmistakably "orbital."

**Secondary Goal**: Evolve the global `data-font-mode="mono"` toggle into a true native typography system (the 3-tier set) that affects the entire app when enabled, while remaining opt-in and non-destructive to the default experience.

**Non-Goals (this round)**:
- Do not replace the gated two-column inspector on the main dashboard/library yet (user directive: "dashboard should remain a single stream for now").
- Do not overhaul the map view or review dialog in this slice (they can be modernized later).
- No changes to default (non-orbital) experience whatsoever.

---

## 2. Core Principles (Non-Negotiable)

1. **Strict theme isolation** — Everything visual/behavioral lives behind `isOrbital` from `useOrbitalTheme()` or the forced `theme-orbital` shell on `/orbit`.
2. **Canonical authoring surface** — All new orbital surfaces must use `import { orbital, OrbitalCard, ... } from "@/components/orbital"`. No ad-hoc `font-mono`, `sky-*`, `rounded-2xl`, raw white/10, etc.
3. **Paper as spec** — Live implementation must match the three artboards within engineering tolerance. Mandatory screenshot + checkpoint reviews during implementation.
4. **First-class motion & a11y** — Smooth slide-in (CSS or framer-motion, respects `prefers-reduced-motion`), excellent keyboard navigation (arrow keys to move selection, Enter to open panel, Esc to close, hotkeys on overlays), focus management, ARIA.
5. **Performance & density** — List must feel instant even with 50–100 items. Virtual scrolling considered if needed, but start with optimized rendering.
6. **Grok integration preserved** — All existing decision/scan/apply logic continues to work; only the presentation layer changes.

---

## 3. Scope & Deliverables

### In Scope (this implementation)

**Phase 1 — Foundations (small, high-leverage)**
- Mature the global typography system to the true 3-tier model (new CSS variables + utility classes in globals.css + providers).
- Extend the `orbital` primitives barrel with any missing pieces needed for the new surfaces (e.g., `orbital.menu`, `orbital.actionPill`, heading variants).
- Small cleanup of `orbit-triage-card.tsx` (or replacement) to support the new list pattern.

**Phase 2 — Clean High-Density List**
- New or heavily refactored list rendering on `/orbit` that matches 6U-0 exactly:
  - Consistent vertical meta lanes (author, time, engagement counts) using fixed-width slots.
  - Subtle selected state with cyan left accent bar + glass elevation.
  - Dense but calm row height (~43–48px).
  - Header + toolbar that matches the artboard (ORBIT branding, triage queue label, sort, search, 90d pill, etc.).
- Selection model: clicking a row selects it and opens/ updates the slide-in panel (single active selection).

**Phase 3 — Slide-in Review Panel (the hero piece)**
- New component: `OrbitSlideInPanel` (or `OrbitReviewPanel`).
  - 460px wide, absolutely positioned from right edge.
  - Glassmorphic surface with cyan-tinted left border + soft left depth shadow.
  - Sections exactly as in 7X-0:
    - Post context (title/author snippet)
    - Grok Suggestion (glass card, insight text, ACCEPT / DISMISS in cyan)
    - Tags (pills + add)
    - Collections (pills + dashed add)
    - Decisions row: big primary cyan "KEEP + TAG", bronze "ARCHIVE", neutral "DISCARD" + note affordance.
  - Smooth enter/exit animation.
  - Close button + Esc key.
  - Live sync with the selected bookmark + current Grok decision.

**Phase 4 — Contextual Overlays (light & fast)**
- Two lightweight components:
  - `OrbitQuickActionsMenu` — compact vertical floating menu (as in HX-0 Example 1) triggered by kebab / right-click / keyboard on a row.
  - `OrbitActionPill` — ultra-light 4-icon floating pill (as in HX-0 Example 2) that appears on hover or when a row is the active selection.
- Actions: Keep, Tag, Add to Collection, Snooze/Archive, Review (opens full dialog or panel).
- Dismiss on outside click / Esc. Positioned intelligently (avoid viewport edges).

**Phase 5 — Polish, Integration & First-Class Experience**
- Wire the new list + panel + overlays into the existing Orbit logic (useOrbitScan, decisions, apply handlers, review dialog fallback).
- Full keyboard support and focus management in the list.
- Respect reduced-motion for the slide-in and any glows.
- Loading / empty / error states that match the orbital language.
- Micro copy and micro-interactions that feel premium (subtle telemetry pulses on Grok updates, etc.).
- Visual QA: multiple live screenshots compared against the three Paper artboards.

**Out of Scope (this round)**
- Dashboard two-column inspector (leave gated as-is).
- Map page overhaul.
- Full review dialog modernization (keep for now; it can adopt the new language later).
- Collections / Analytics / other surfaces.
- Mobile responsive treatment for the slide-in (start desktop-first; mobile can fall back to sheet).

---

## 4. Technical Architecture & New Components

### Recommended New Files (thin & focused)
- `src/components/orbit/orbit-list.tsx` — The clean scannable list (primary export).
- `src/components/orbit/orbit-slide-in-panel.tsx` — The 460px review workspace.
- `src/components/orbit/orbit-quick-actions.tsx` — Menu + Pill overlays.
- (Optional) `src/components/orbit/orbit-list-row.tsx` — Extracted row for reuse if the old triage card is retired.

### Reuse / Extend Existing
- Keep using `useOrbitScan`, decision state, `handleApply`, etc.
- The existing `OrbitReviewDialog` remains available via "Full review →" link inside the slide-in (as shown in 7X-0).
- Extend `@/components/orbital` barrel with:
  - `orbital.menu`, `orbital.actionPill`, possibly a `SectionHeader` primitive.
- Typography: introduce CSS variables and classes for the 3 tiers under `[data-font-mode="mono"]` (and also available under orbital theme even if mono toggle is off? — decision point for user, but artboards used them as the native voice).

### Selection & State Model (new for this pattern)
- `activeBookmarkId` still drives everything.
- Selecting a row in the list:
  - Sets active ID
  - Opens (or updates) the slide-in panel on the right
  - The panel is **not** a permanent column — it overlays/slides in from the edge.
- The list itself stays full-width (or constrained only by viewport) when the panel is open — exactly as in 7X-0.

### Animation
- Slide-in: `transform: translateX(100%)` → `0` with a short ease (200–280ms). Use `prefers-reduced-motion` to disable.
- Overlay menu/pill: simple opacity + scale, very fast (120–160ms).

---

## 5. Implementation Phases (Bounded & Reviewable)

**Phase A — Typography + Primitives (1–2 days)**
- Update globals.css with the 3-tier system (new classes: `.text-mono-display`, `.text-mono-ui`, `.text-mono-data` with correct font stacks, weights, tracking, tabular-nums).
- Update providers / theme-init if needed for the richer font loading (IBM Plex Mono must be added to layout if not already present).
- Extend `orbital` object with new surface tokens.
- Small test surface (e.g., a dev-only showcase on /orbit or a new story).

**Phase B — Clean List (core of the experience)**
- Build `OrbitList` that renders the high-density rows matching 6U-0.
- Replace the current `.map(OrbitTriageCard)` block.
- Selection wiring.
- Toolbar/header alignment with the artboard.

**Phase C — Slide-in Panel**
- Build `OrbitSlideInPanel`.
- Integrate with active bookmark + decisions.
- Decision actions wired to existing handlers.
- "Full review" link to the existing dialog.

**Phase D — Overlays**
- Build the two overlay components.
- Trigger points (hover, kebab, keyboard).
- Action handlers (quick keep, quick tag, etc.).

**Phase E — Integration, Polish, QA**
- Full wiring, keyboard, reduced motion, empty states, loading shimmer in orbital language.
- Screenshot comparison against Paper boards (multiple viewport states).
- Performance pass on the list.
- Gating hygiene audit (ensure zero leakage to default).

**Exit Criteria for each phase**: At least one concrete code change + live (or Paper + screenshot) verification that the piece matches the spec before moving to the next.

---

## 6. Risks & Mitigations

- **Typography font loading** — IBM Plex Mono and Recursive (if used) must be added to `layout.tsx` via next/font/google without increasing bundle or causing FOUT. Mitigation: add them early, use `variable` fonts.
- **Panel vs Dialog conflict** — Some users may still want the full review dialog. Keep the "Full review →" affordance and make the slide-in feel like a faster lightweight alternative.
- **Overlay positioning** — Dynamic positioning logic for the floating menu/pill to avoid clipping. Use a small positioning utility or `floating-ui`.
- **State sync** — When Grok scan updates decisions while the panel is open, the panel must reactively update (already possible via existing scan state).
- **Mobile** — Slide-in on small screens may need to become a bottom sheet. Defer to a follow-up if needed.

---

## 7. Success Metrics (Visual + Experiential)

- Any screenshot of the new `/orbit` page (with panel open or closed, with overlays visible) is immediately recognizable as matching the three Paper artboards.
- Triage feels subjectively faster and calmer than the old two-column version (user + designer validation).
- Zero visual or behavioral changes when `isOrbital === false`.
- Keyboard-only users can complete a full triage pass without a mouse.
- The global mono toggle now delivers the full 3-tier native experience across the app (not just patched labels).

---

## 8. Execution Command (when ready)

Once this plan is reviewed and approved, execute via the `/implement` skill with appropriate effort and specialist reviewers (plan-alignment + general + tests + a11y if relevant).

Recommended prompt skeleton:

```
/implement --effort 3 Orbit Page Redesign: Replace the current two-column inspector on /orbit with the clean high-density list + right slide-in review panel + lightweight contextual overlays as specified in docs/design/Orbit-List-SlideIn-Overlays-Implementation-Plan.md. Use Paper artboards 6U-0, 7X-0, and HX-0 as the visual source of truth. Introduce the 3-tier monospace-native typography system as the default voice under the global mono toggle. All changes strictly gated behind the orbital theme. Preserve all existing Grok scan/decision/apply logic. Follow the phased approach, canonical orbital primitives contract, and visual QA gates exactly.
```

---

**Ready when you are.**

This plan turns the excellent design work from the three parallel subagents into a first-class, shippable Orbit experience that finally feels like the "personal orbital intelligence system" the entire language has been aiming for.

Please review the plan above. Any adjustments, scope tightening, or priority changes? Once you say "looks good / proceed / sounds right", I will prepare the exact `/implement` invocation and we can run it. 

We can also do a quick "pre-flight" pass (small concrete edits to typography primitives) before the full loop if you want early momentum.

Your call — let's make this first-class.