<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Design language contract

MarkMaster's UI is simple, flat, and precise: X.com structure (single reading column,
borderless rows split by 1px dividers, weight-driven hierarchy) with square geometry and
one light source — a state glow derived from the accent. Rules are enforced by ESLint
(`no-restricted-syntax` in `eslint.config.mjs`) where practical; follow them in all UI code.

## Color
Neutrals are neutral. The accent (`--primary`) appears only on interactive and selected
state: primary buttons, links, focus rings, `accent-soft` selection tints, and the glow.
Never `color-mix` the accent into backgrounds, surfaces, or borders.
- Hovers use `bg-hover` (neutral wash) — never `hover:bg-accent-soft`/`hover:bg-primary/*`.
- Muted text is `text-muted-foreground` (AA on every surface). Don't fade text further
  with `/NN` opacity.
- Status colors: `success`, `warning`, `destructive` tokens — never hard-coded
  `emerald-*`/`amber-*`/`red-*`, never `dark:text-white/*` overrides.

## Surfaces
Surfaces are opaque. Use the `surface-*` utilities in `src/app/globals.css` — never
hand-roll `border border-hairline-* bg-surface-*` pairings:
- `surface-card` — card (hairline + `bg-card`). `surface-veil`/`surface-solid` are aliases.
- `surface-inset` — borderless tonal well inside a card (`bg-surface-2`)
- `surface-inset-strong` — strips, sticky subbars (hairline + `bg-surface-2`)
- `surface-overlay` — large overlay shells (opaque popover + the one stage shadow)
- `surface-glass` — sticky chrome bars (opaque background)
Prefer divider rows (`border-b border-hairline-soft`) over boxes. Cards are for things you
pick up (collections, dialogs) — not for stats or sections. No boxes-in-boxes, no tinted
"icon tiles" behind icons: use a bare icon.
No `backdrop-blur` except the sticky page header chrome (`src/lib/app-chrome.ts`) and the
modal backdrop (`appOverlayBackdropClassName`).

## Glow (the one light source)
`state-selected` (rows/items) and `.menu-selection-active` (nav) paint a 2px accent rail +
soft wash *inside* the element with background layers — no box-shadow, no pseudo-elements,
so it can't be clipped, bleed into neighbours, collide with focus rings, or shift layout.
`--glow` is lightness-clamped per mode so every accent theme reads. Use it only for
selected / active / focused state and live progress. Never on backgrounds, hover, cards,
chips, or search. No decorative gradients, beams, or shimmer effects. Orbit
(`/orbit` and `/orbit/map`) may keep one pair of translucent Orbit marks behind
the page; no other watermarks.

## Typography
Geist (UI + reading) and Geist Mono (data) by default; alternate presets live in
`src/lib/typography-presets.ts`. Hierarchy comes from size and weight, not tracking:
labels are sentence case `text-xs font-medium text-muted-foreground` (`SANS_LABEL` /
`useTypography()`), section labels `text-[13px] font-semibold text-muted-foreground`. Post text is 15px.
No new `uppercase` + tracking micro labels. `text-2xs` (10px) is for dense metadata/badges
only, never for labels. Tracking values: `tracking-[0.08em]`, `tracking-wider`,
`tracking-[0.14em]` (mono preset chrome) — plus the sidebar wordmark's `tracking-[-0.02em]`.

## Focus
One recipe: `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45`
(destructive controls may use `ring-destructive/*`; list rows use `ring-inset`). Never
`ring-primary` for focus, never `ring-[3px]`/`ring-3`. Selected cards/swatches may use
`ring-primary` decoratively.

## Shape
Square aesthetic — no pills:
- `rounded-sm` for components (cards, buttons, chips, menus, dialogs)
- `rounded-[2px]` for micro-elements (meter fills, switch thumbs, scroll thumbs)
- `rounded-full` only for true circles (avatars, dots, swatches, spinners)

## Buttons
`default` = the single primary action in a view; `outline` = secondary; `ghost` =
tertiary/toolbar; `secondary` = filled neutral; `highlight` = toggled/selected state only.

## Elevation
Borders, not shadows. Floating surfaces (menus, dialogs, tooltips) use
`border-hairline-strong` on `bg-popover`, flat. The only sanctioned shadow is
`surface-overlay`'s stage shadow.

## Orbit map chrome
The map canvas is dark in dark mode and tinted in light mode (`src/lib/orbit-map-palette.ts`).
Chrome floating over it uses `.map-glass` (`src/styles/orbit.css`): theme-aware, near-opaque
popover, no blur. `.map-glass-accent` (thin accent top edge) is reserved for the map console.
The Pixi hub/cluster glows are the app's signature — keep them in the scene, not in CSS.

# Viewport layout contract

All page shells, scroll regions, and overlay sizing go through the shared layout system.
Do not hand-roll `100vh`/`100dvh`, `h-screen`, `calc(100vw - …)`, or ad-hoc flex chains
for viewport containment.

**Source of truth**
- Components: `src/components/app-page-shell.tsx`, `src/components/app-route-error.tsx`
- Class tokens: `src/lib/app-layout.ts`
- CSS utilities + variables: `src/app/globals.css` (`.app-viewport`, `.app-main-scroll`,
  `.app-overlay-dialog*`, `--app-overlay-inset`)

## Page shells — pick one

| Surface | Use | Notes |
|---|---|---|
| Authenticated app pages | `AppPageShell` | Dashboard, Orbit, Collections, Settings, Analytics |
| Orbit map | `AppPageShell layout="column"` | Header pinned; map body flexes below |
| Single-column authenticated | `AppPageShell` (no `sidebar`) | Collection detail |
| Public / marketing | `AppPublicPage` | Share links, landing — document scroll OK |
| Loading / error / empty | `AppPageCenter` | Suspense fallbacks, inline states |
| Route error boundaries | `AppRouteError` | Next.js `error.tsx` files |
| Auth splash | `.auth-splash` in `src/styles/auth.css` | Login / home when logged out |

`(main)/layout.tsx` already wraps authenticated routes in `appFixedViewportClassName`.
Pages inside `(main)` should use `AppPageShell`, not another fixed viewport wrapper.

## `AppPageShell` defaults

- `layout="scroll"` (default) — sticky header scrolls with feed content.
- `layout="column"` — header + flex body; no inner scroll wrapper (Orbit map only).
- `sidebar`, `mainTop`, `scrollRef`, `mainProps` — compose at the call site.
- Portals/dialogs render as siblings outside `AppPageShell` (fragment wrapper).

Orbit routes may pass `className="orbit-route-default"`; do not reintroduce
`orbitShellClass()` page wrappers when `AppPageShell` is already in use.

## Overlays and floating panels

Use tokens from `@/lib/app-layout` — never raw `calc(100dvh - 1.5rem)` / `calc(100vw - …)`:

- `appOverlayDialogBookmarkClassName` + `appOverlayDialogGridBookmarkClassName` — bookmark overlay
- `appOverlayDialogReviewClassName` + `appOverlayDialogGridReviewClassName` — Orbit review
- `appOverlayDialogSmClassName` — compact dialogs (keyboard shortcuts)
- `appOverlayBackdropClassName` — frosted overlay backdrop
- `appOverlayPanelClassName` — mobile Orbit map rail

Margins are driven by `--app-overlay-inset` and `--app-overlay-inset-wide` in `:root`.

## Resize rules (do not break the chain)

Every flex column that must shrink vertically needs `min-h-0`; every flex child that must
not overflow horizontally needs `min-w-0`. The shell components already apply these —
when adding nested layout, preserve the chain rather than overriding with `h-auto` or
`overflow-visible` on shell ancestors.

- Vertical scroll belongs in `app-main-scroll` (via `AppPageShell`), not on `body`.
- Horizontal overflow is clipped at `html`, `body`, and page shells — do not re-enable
  `overflow-x-auto` on outer shells without a deliberate, local reason.

## Sticky header height

`PageHeader` with `sticky` measures its rendered height (including compact toolbars and
expanded compact search strips) and writes `--app-header-height` on `documentElement`.
Downstream sticky subbars use `--header-height` — do not hard-code compact toolbar or
search-strip pixel offsets; keep the search trigger inline in the toolbar row (`min-w-0`
flex chain) so the header measures correctly on narrow viewports.

