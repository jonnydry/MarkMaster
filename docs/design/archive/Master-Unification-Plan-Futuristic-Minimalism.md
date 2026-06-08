# Master Unification Plan: Imaginative yet Minimal Futurism

**MarkMaster — Personal Orbital Intelligence System for X Bookmarks**

**Status:** APPROVED WITH CONSTRAINT — Current core color scheme preserved as default. Futuristic Minimalism language implemented as additional opt-in theme layer(s) on top of existing structure. Proceed with /implement.

**User Directive (2026-05-19):** Do not change the color scheme fundamentally for now. Current palette, primary blue accents, surfaces, and hairlines in the default dark/light themes must remain intact. The "Imaginative yet Minimal Futurism" direction (deep void + cyan-teal orbital glow + warm bronze + advanced orbital effects) should be added as one or more new theme options layered on the core structure. Typography elevation, motion language, component restraint, distraction cleanup, and orbital motifs can be introduced within the new theme(s) and, where non-color-breaking, as universal improvements.

**Date:** 2026-05-19  
**Context:** Prior Master Design Plan sessions established the direction (deep void, cyan-teal orbital glow, warm bronze accents, JetBrains Mono as primary expressive/telemetry voice, orbital ring motifs, glassmorphism with inner glow + grain, extreme restraint). Current live codebase remains on a transitional blue-primary dark theme with mixed typography and generic shadcn surfaces. This plan adds the new design language as a first-class, switchable theme without replacing the production color system.

---

## 1. Vision & Positioning

MarkMaster is repositioned as a **personal orbital system** — your private constellation of saved X knowledge, with Orbit (Grok intelligence layer) as the living nucleus that ingests, triages, and evolves the system.

The interface must feel like mission control for that system: deep cosmic void, precise thin rings, living cyan-teal glow as the primary light source, warm bronze as refined secondary accent. Every surface, every piece of data, every interaction reinforces "you are in orbit around your knowledge."

**Guiding principles (restraint-first):**
- Extreme negative space is a feature.
- Sleek monospace (JetBrains Mono) is the unmistakable telemetry/expressive voice.
- Subtle advanced effects (independent ring rotations, nucleus breathing, sparse telemetry particles) only on meaningful AI actions or as ambient atmosphere.
- Glassmorphism with inner orb glow + fine grain on elevated surfaces.
- One cohesive language across landing, auth, Orbit triage/map, library grid, collections ("constellations"), analytics, chrome, and all overlays.

---

## 2. Complete Visual System — Layered Theme Approach (per user directive)

**Core rule:** The existing color system (`:root` light + `.dark` dark with current blue primary `#2563eb`, surfaces, hairlines, `--page-shell-*`, etc.) remains the **default production theme** and is **not modified** for colors. All current hex values, var usages, and component color behavior stay intact for the default experience.

The "Imaginative yet Minimal Futurism" language is introduced as a **parallel, opt-in theme layer** on top of the stable core structure.

### Theme Architecture

- Default (unchanged): Current production palette and tokens.
- New opt-in theme: Activated via `data-theme="orbital"` (or `class="theme-orbital"`) on `<html>` or a root container. This can be:
  - A future user toggle in Settings ("Orbital Theme" or "Futuristic Minimalism").
  - Applied selectively during development to specific routes/surfaces (e.g., force on `/orbit/*` for showcase, or a "Preview new design language" dev mode).
  - Eventually promoted to default once the language is mature and user-validated.

### New Orbital / Futuristic Theme Tokens (parallel set)

Defined under a scoped selector so they do not leak into the default theme:

```css
/* === ORBITAL THEME (opt-in, does not affect default colors) === */
:root[data-theme="orbital"],
html.theme-orbital,
.theme-orbital {
  /* Deep cosmic void grounds — only active when the theme is on */
  --background: #0A0A0A;
  --foreground: #EDE8E0;
  --card: #111111;
  --card-foreground: #EDE8E0;
  --popover: #0F0F0F;

  /* Primary living orbital glow (cyan-teal) */
  --primary: #5CE1C7;
  --primary-foreground: #0A0A0A;
  --orbital-glow: #5CE1C7;
  --orbital-glow-strong: #7CF4D9;

  /* Refined warm bronze accent */
  --accent: #C9AA6C;
  --accent-foreground: #0A0A0A;
  --bronze: #C9AA6C;
  --bronze-muted: #A88A4E;

  /* Semantic glows and rings for the new language */
  --accent-glow: rgba(92, 225, 199, 0.18);
  --accent-glow-strong: rgba(92, 225, 199, 0.28);
  --ring: #5CE1C7;
  --ring-bronze: #C9AA6C;

  /* Deeper layered surfaces for glassmorphism */
  --surface-1: #0F0F0F;
  --surface-2: #131313;
  --surface-3: #171717;
  --surface-elevated: #1C1C1C;

  /* Thin precise hairlines */
  --hairline-soft: rgba(255, 255, 255, 0.055);
  --hairline-strong: rgba(255, 255, 255, 0.095);
  --border: #1F1F1F;
  --input: #151515;

  /* Muted and sidebar inherit the void language */
  --secondary: #151515;
  --secondary-foreground: #C8C0B4;
  --muted: #151515;
  --muted-foreground: #7A7570;

  --sidebar: #0C0C0C;
  --sidebar-foreground: #C8C0B4;
  --sidebar-primary: #5CE1C7;
  --sidebar-primary-foreground: #0A0A0A;
  --sidebar-accent: rgba(92, 225, 199, 0.10);
  --sidebar-accent-foreground: #7CF4D9;
  --sidebar-border: #1F1F1F;
  --sidebar-ring: #5CE1C7;

  /* Selection and soft accents tinted to the orbital glow */
  --accent-soft: rgba(92, 225, 199, 0.09);
  --menu-selection-bg: rgba(92, 225, 199, 0.07);
  --menu-selection-ring: rgba(92, 225, 199, 0.22);
  --menu-selection-glow: rgba(92, 225, 199, 0.15);

  /* Page shell ambient wash uses cyan-teal instead of blue */
  --page-shell-depth-top: #0C0C0C;
  --page-shell-depth-bottom: #0A0A0A;
  --page-shell-ambient: rgba(92, 225, 199, 0.06);
  --page-shell-highlight: rgba(255, 255, 255, 0.028);

  /* Status harmonized to cosmic palette */
  --success: #34D3A3;
  --warning: #C9AA6C;
  --emerald: #34D3A3;
  --note: #A5B4C8;

  /* Charts follow the new accents */
  --chart-1: #5CE1C7;
  --chart-2: #7CF4D9;
  --chart-3: #C9AA6C;
  /* ... etc. */
}

/* Extend Tailwind theme when the orbital class is present */
.theme-orbital {
  /* Tailwind arbitrary values and utilities will pick up the above vars */
}
```

**Glassmorphism + Grain** (same utilities as previously proposed, now scoped or available when the theme is active):
```css
.theme-orbital .glass-orbital { /* ... */ }
.theme-orbital .grain { /* ... */ }
```

**Implementation notes:**
- The theme switch can live in `Providers` or a new `ThemeProvider` extension (or simple `document.documentElement.setAttribute('data-theme', 'orbital')`).
- For initial rollout, we can force `data-theme="orbital"` on the Orbit route group or specific artboards to showcase the language without affecting the rest of the app.
- All subagent token work, glass utilities, and mapping tables remain valid — they now live under the new theme scope instead of replacing the default `.dark`.
- Current hardcoded blues, `ring-primary`, `accent-soft` blue, etc. continue to work in default mode.
- Logo marks (`orbit-logo-mark.tsx`) can accept a prop or read a CSS var to decide tinting only when the orbital theme is active.

This structure satisfies the user's directive perfectly: the core production color experience is untouched, while the full ambitious futuristic language is built as a clean, toggleable layer ready for future promotion or A/B testing.

**Light Mode within Orbital Theme:** Also deprioritized for the new theme. The orbital language is dark-first by nature.

---

## 3. Typography Architecture (Mono as Primary Expressive Voice)

**Fonts (already loaded):**
- `--font-jetbrains-mono` — **Primary expressive/telemetry voice**
- `--font-dm-sans` (via `.heading-font`) — Geometric hierarchy / display only
- `--font-inter` — Body, prose, nav, UI labels (default)

### Strict Scale & Rules

**Mono (JetBrains) — Telemetry / Data / Grok / Status Voice (use everywhere numbers, labels, reasoning, shortcuts, confidence, timestamps appear):**
- Large KPI / metric: 20–28px, semibold, tabular-nums, tracking ~0.02em
- Labels / status / telemetry / uppercase: 10–11px, medium, uppercase, tracking 0.12–0.18em, tabular
- Small data: 10–12px, medium, tabular-nums

**DM Sans (heading-font) — Display / Hero / Major Titles only:**
- Hero/wordmark: 56–72px, extrabold, tracking -0.035em
- h1/page title: 28px, bold, -0.025em
- h2: 20px, semibold, -0.02em
- h3: 16px, semibold

**Inter — Everything else:** 15px body (leading 1.65), 14px UI, 11px labels, generous prose line-height.

**Enforcement:** New utilities `.text-mono-data`, `.text-mono-label`, `.text-heading-display` + `typography.ts` helper. Replace all 12+ hardcoded violations (IBM Plex Mono overrides in orbit/* files, prose in mono, numbers in DM Sans, missing tabular-nums, ad-hoc tracking).

**Weight discipline:** 400/500/600/700 only. Tabular figures non-negotiable on every numeric surface.

---

## 4. Effects & Motion Language (Orbital Mechanics)

**Philosophy:** Slow, independent, perpetual motion that feels alive but never distracting. Motion intensifies only on Grok/AI actions. Respect `prefers-reduced-motion`.

**Core Keyframes (globals.css):**
- `ring-rotate-slow/medium/fast` (68s / 47s / 31s linear infinite, independent speeds)
- `nucleus-breath` (gentle 5.8s scale 1.0 → 1.025)
- `telemetry-pulse` / `telemetry-dash` / `telemetry-align`
- `glass-inner-glow`, `orbit-arc-pulse`

**Reusable Component:** `OrbitalRings` (enhance existing static SVG in `orbital-auth-experience.tsx`). Three independently rotating tilted ellipses + breathing nucleus + sparse telemetry dots. Props for speed, color (cyan/bronze), animated, showParticles.

**Where Effects Appear:**
- Hero/auth: large animated rings + breathing orb behind/around logo
- Orbit triage: living confidence arc (gradient ring that pulses on high confidence or Grok update)
- Pixi map: non-breaking enhancements — slow-rotating selection rings, breathing on core nodes, telemetry dashes traveling on `ASSIGN`/`FOCUS`/`Grok apply` events (shared event bus + tokens)
- Cards/panels: subtle `.glass-orb` inner glow on elevated surfaces; optional corner mini-ring on hover
- Global: micro grain on glass + telemetry dots that "align" briefly on meaningful AI actions

**Performance:** GPU-only (transform/opacity), reduced-motion freeze, low concurrent count, shared `src/lib/orbit-visual.ts` constants for CSS + worker.

---

## 5. Unified Component Primitives

**New / Elevated Variants (button.tsx cva + others):**
- `orbitalPrimary`: cyan-teal glow CTA with soft shadow-glow
- `orbitalOutline`: bronze border, hover bronze tint
- `orbital` / `orbitalGhost`: restrained glass + cyan focus

**Card/Surface:** `rounded-sm`, `glass-orbital` or `bg-surface-1/70 + border-hairline`, optional `data-glow="cyan"` or `data-status="bronze"`. Strict `px-4 py-4` / dense `px-3 py-3`.

**Badge/Pill/Confidence:** Always starts with orbital dot (`size-1.5 rounded-full`), mono text, cyan/bronze/emerald-teal states.

**Sidebar:** Mission-control rail. Thin collapsed state with centered icons + orbital status dots. Expanded: dense mono counts, `tracking-[0.18em]` section headers, cyan active ring accent.

**Forms/Dialogs/Overlays:** Cyan-teal focus rings everywhere (`ring-2 ring-orbital-glow/45`), glass surfaces, `rounded-sm`.

**16 Concrete Distractions to Eliminate (examples from audit):**
- `rounded-2xl` + heavy gradients/shadows on triage cards, review dialogs, focus strips (normalize to `rounded-sm` + thin ring/glass)
- All `ring-primary/60`, `ring-ring/45`, blue `menu-selection-*`, `accent-soft` blue tints
- Ad-hoc `shadow-sm/xl`, `rounded-[18px/22px/24px]`, inconsistent icon button sizes (`size-6/8/9/10`)
- Mixed IBM Plex overrides, prose in mono, numbers in heading-font
- Over-dense dashboard toolbar vs. simple PageHeader on other surfaces
- Sidebar preview overload and inconsistent dot radii
- Isolated `#0b0f1a` on Pixi canvas vs. global void

**New utilities:** `.orbital-glass`, `.orbital-glow-cyan`, `.orbital-dot`, `.orbital-mono`, `.orbital-focus`.

---

## 6. Priority Surfaces & Desired "After" States

**Ranked by demonstration impact:**

1. **Orbit Workspace** (`/orbit` triage + `/orbit/map`) — Flagship. Mission-control header with live mono telemetry + breathing orb indicator. Triage cards = deep void glass + orbital ring accents + living confidence arcs. Pixi map = native extension of the language (colors, ring overlays, telemetry on actions). Review sheets minimal and precise.

2. **Landing / Auth Entry** (`OrbitalAuthExperience`) — Cinematic first impression. Elevate existing void + `OrbitRings` to full animated independent rotations + breathing nucleus + telemetry. Refined headline hierarchy with mono voice where telemetry-like. CTA with orbital glow.

3. **Library / Dashboard** ("satellite field") — Calm starfield of bookmark satellites. Unified slim MissionBar chrome, `BookmarkCard` with ring/tag treatments + mono metrics, sidebar as high-signal rail.

4. **Collections** ("Constellations") + Analytics + Settings + all overlays — Consistent language, no exceptions.

**Cross-surface cleanups:** Inconsistent headers/toolbars, competing filter UIs, sidebar density, typography voice drift, surface elevation mismatch, dialog chrome, mobile friction.

---

## 7. 4-Phase Implementation Roadmap

**Phase 1: Foundations + Cinematic Landing (1–2 weeks)**
- Token migration in globals.css + theme extensions
- Typography utilities + first-pass violation fixes
- Reusable `OrbitalRings` component + CSS keyframes
- Full polish of `OrbitalAuthExperience` / login
- Create initial Paper reference artboards (Hero + Brand System tokens)
- Exit: Landing reads as definitive brand expression; Paper QA passed

**Phase 2: Orbit as Hero Demonstration (2–3 weeks)**
- Mission-control header + telemetry strip on `/orbit`
- Triage cards, strips, review sheets in new language
- Non-breaking Pixi enhancements (colors, rings, telemetry parity)
- Paper artboards for triage + map
- Exit: Orbit feels like the unambiguous flagship; any screenshot communicates the product

**Phase 3: Library + Common Chrome (2 weeks)**
- Unified MissionBar / PageHeader pattern
- BookmarkCard, sidebar, dashboard filters, Collections grid in language
- Global distraction cleanups (typography, surfaces, buttons, badges)
- Paper artboards for Library + Constellations
- Exit: Daily workspace feels like extension of Orbit/Landing

**Phase 4: Supporting Surfaces + System Lock (1–2 weeks)**
- Analytics, Settings, Share, all dialogs/sheets, mobile, command palette
- Final visual regression + Brand System reference board in Paper
- Exit: "Any screenshot reads as one cohesive product." Zero competing languages.

**Visual QA Gates:** Mandatory `get_screenshot` + 6-checkpoint reviews (spacing/typography/contrast/alignment/artboard-fit/repetition) after every meaningful group of changes. Paper artboards are the source of truth for design intent; live implementation must match within engineering tolerance.

**Technical Constraints:** Pixi worker core unchanged (only theme/overlay/DOM); auth flows untouched; existing viewport/shell preserved; performance budget respected.

---

## 8. Enactment via /implement

**User constraint (explicit):** The current core color scheme must not be changed fundamentally. The existing `:root` / `.dark` palette, blue primary, surfaces, and hairlines remain the default production experience. All new futuristic minimalism visuals (deep void, cyan-teal orbital glow as primary light, warm bronze accents, inner-glow glassmorphism, orbital ring motifs, advanced subtle effects) are introduced strictly as an **additional opt-in theme layer** (`data-theme="orbital"` or equivalent) on top of the stable core structure.

When ready, execute with this exact command (the implementer prompt embeds the layered-theme directive and all subagent detail):

```
/implement --effort 3 Master Unification Plan: add "Imaginative yet Minimal Futurism" (futuristic minimalism) as a new opt-in theme layer on top of MarkMaster's existing unchanged color system. Current palette, --primary blue, surfaces, and hairlines stay as the default. Introduce data-theme="orbital" (or .theme-orbital) with parallel deep-void + cyan-teal glow + warm bronze tokens, JetBrains Mono as the primary expressive/telemetry voice, orbital ring motifs, glassmorphism with inner orb glow + fine grain, and advanced subtle orbital-mechanics effects. Follow the revised 4-phase roadmap and all sections in docs/design/Master-Unification-Plan-Futuristic-Minimalism.md exactly (especially the new "Layered Theme Approach" in Visual System). Use Paper MCP to create reference artboards for the new theme. Prioritize building the full language first on the Orbit workspace as the hero showcase (apply the new theme there), then Landing/Auth, then Library. Perform typography elevation, component restraint, and distraction cleanup work that does not alter default colors. The new theme must be cleanly toggleable without side-effects on the core experience.

Past designer subagent outputs, the full plan document, and this constraint are the single source of truth.
```

The implement skill will run the full implement → review (including plan-alignment) → fix loop until zero issues of any severity. The resulting system will keep production colors stable while delivering the new design language as a first-class, switchable theme.

---

## 9. Success Criteria

- Any random screenshot (any surface, any state, desktop/mobile) is immediately recognizable as the same MarkMaster product.
- Measurable reduction in visual noise, competing weights, ad-hoc radii/shadows/typography.
- All Paper reference artboards approved; live UI matches them.
- Orbit workspace is the unambiguous hero demonstration of the language.
- Zero regressions in Pixi map, auth, CRUD, or performance.
- Internal/beta perception: "the app finally feels like one thing."

**Open Risks (from designer team):**
- Exact Pixi node/edge palette mapping (cyan for intelligence vs bronze for user collections)
- Tag color spectrum curation vs. personality preservation
- Grain/noise perf on many surfaces
- Light-mode long-term support (recommend de-emphasize)
- Migration sequencing to avoid visual thrash during cutover

---

**This document is the single source of truth.** All prior design explorations (orbit illustrations, Brand System boards, "The Problem" page, etc.) feed into it. Execution begins only after user confirmation via `/implement`.

Ready.