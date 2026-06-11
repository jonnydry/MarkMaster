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

## Focus
One recipe: `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45`
(destructive controls may use the `ring-destructive/*` variants). Never `ring-primary`,
never `ring-[3px]`/`ring-3`.

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
