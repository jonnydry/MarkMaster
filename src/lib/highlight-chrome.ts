/**
 * Passive selection chrome — tinted primary, not solid fill.
 * Use for toggles, segments, filters, and selected menu rows.
 * Reserve solid `Button` default / primary CTAs for one-shot actions (Save, Add, Sync).
 *
 * Tailwind utilities (not CSS-only classes) so they win over Button `border-transparent`.
 */

export const highlightActiveClass =
  "border-primary/25 bg-primary/10 text-foreground shadow-none";

/** Segment pill inside a bordered group (background tint only). */
export const highlightSegmentActiveClass =
  "bg-primary/10 text-foreground shadow-none";

export const highlightIdleClass =
  "border-transparent text-muted-foreground transition-[color,background-color,border-color] duration-150 hover:bg-hover hover:text-foreground";

/** Hover affordance for highlight-styled controls. */
export const highlightInteractiveClass =
  "hover:border-primary/35 hover:bg-primary/15";

/** Compact checkbox / radio indicator when selected. */
export const highlightIndicatorActiveClass =
  "border-primary/35 bg-primary/10 text-primary shadow-none";

/** Card or tile selection (settings presets, theme swatches). */
export const highlightSurfaceActiveClass =
  "border-primary bg-accent-soft text-foreground shadow-none";

/** Hollow glass track — matches toolbar wells / highlight button shells. */
export const highlightProgressTrackClass =
  "overflow-hidden rounded-[2px] bg-surface-3 shadow-none";

/** Flat accent fill for highlight progress meters. */
export const highlightProgressFillPrimaryClass =
  "highlight-progress-fill highlight-progress-fill--primary relative h-full overflow-hidden rounded-[2px] bg-primary/30 shadow-none transition-[width] ease-out";

/** Note / X-folder tone fill. */
export const highlightProgressFillNoteClass =
  "highlight-progress-fill highlight-progress-fill--note relative h-full overflow-hidden rounded-[2px] bg-note/30 shadow-none transition-[width] ease-out";

/** Frosted search shell — pairs with .highlight-search-shell in globals.css. */
export const highlightSearchShellClass =
  "highlight-search-shell relative overflow-hidden rounded-sm border border-hairline-strong transition-[border-color] duration-150";
