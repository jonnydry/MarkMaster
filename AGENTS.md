<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design language contract

MarkMaster's UI is sharp, flat, and technical. These rules are enforced by ESLint
(`no-restricted-syntax` in `eslint.config.mjs`); follow them when writing any UI code.

## Surfaces
Use the six `surface-*` utilities defined in `src/app/globals.css` — never hand-roll
`border border-hairline-* bg-surface-*` pairings:
- `surface-card` — primary content card (`surface-1/70`)
- `surface-veil` — translucent card; ambient background reads through (`surface-1/55`)
- `surface-solid` — fully opaque card
- `surface-inset` — nested well inside a card (`surface-2/45`)
- `surface-inset-strong` — stronger well: strips, stat tiles (`surface-2/70`)
- `surface-overlay` — large overlay shells (hairline-strong, /78, stage shadow)
Compose padding/hover/focus at the call site.

## Typography
Labels go through the contract, not ad-hoc classes: `useTypography()` (client) or the
constants in `src/lib/typography.ts`. Only three tracking values exist:
`tracking-[0.08em]` (micro labels), `tracking-wider` (section labels),
`tracking-[0.14em]` (chrome labels — sidebar, map strips). Micro text sizes:
`text-2xs` (10px) and `text-xs` — nothing smaller.
Sanctioned exception: the sidebar "MarkMaster" wordmark uses `tracking-[-0.02em]`
as deliberate brand tightening — do not copy that value anywhere else.

## Focus
One recipe: `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45`
(destructive controls may use the `ring-destructive/*` variants). Never `ring-primary`,
never `ring-[3px]`/`ring-3`. `ring-primary` is banned for focus indication only —
decorative selection states (e.g. selected cards/swatches) may use it; that is the
sanctioned exception.

## Shape
Square aesthetic — no pills:
- `rounded-sm` for components (cards, buttons, chips, menus, dialogs)
- `rounded-[2px]` for micro-elements (meter fills, switch thumbs, scroll thumbs)
- `rounded-full` only for true circles (avatars, dots, swatches, spinners)

## Elevation
Borders, not shadows. Floating surfaces (menus, dialogs, tooltips) use
`border-hairline-strong` on `bg-popover`, flat. The only sanctioned shadow is
`surface-overlay`'s stage shadow.

## Orbit map chrome
The map canvas always paints space-black regardless of theme. Chrome floating over it
uses `.map-glass` (literal white/black alpha is intentional there — nowhere else).
Anything outside the canvas must remain theme-aware (light mode exists).

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
- `sidebar`, `watermark`, `mainTop`, `scrollRef`, `mainProps` — compose at the call site.
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

