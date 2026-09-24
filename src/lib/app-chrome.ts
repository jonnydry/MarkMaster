/**
 * Sticky page-header chrome. One deliberate frost layer (X-style): opaque
 * without backdrop-filter support, near-opaque with it, so scrolling media
 * never shows through as more than a soft ghost.
 */
export const appChromeFrostedClassName =
  "bg-background supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur-xl";

/** Feed-header chrome — dashboard / Orbit toolbars. Same single frost layer. */
export const appFeedHeaderFrostedClassName = appChromeFrostedClassName;

/** Toolbar controls sit directly on the header — no wells behind icons. */
export const appToolbarSurfaceClassName = "";

/** Search field — filled, borderless-looking well; focus lights the border. */
export const appToolbarSurfaceShellClassName =
  "toolbar-search-shell rounded-sm border border-transparent bg-surface-2";

/** Segmented control group — one hairline, no fill. */
export const appToolbarSurfaceGroupClassName = "border-hairline-soft bg-transparent";

/** Frosted shell for compact floating search over scrolling feed media. */
export const appFloatingSearchShellClassName =
  `floating-search-shell surface-overlay rounded-sm`;

/** 32px — compact feed toolbar control box (icon tiles, avatar, menu). */
export const appToolbarControlCompactClassName = "size-8";

/** 32px height for chips, triggers, and segmented shells in compact toolbars. */
export const appToolbarControlCompactHeightClassName = "h-8";

/** 36px — expanded feed toolbar control box. */
export const appToolbarControlExpandedClassName = "size-9";

/** 36px height for chips and triggers in expanded feed toolbars. */
export const appToolbarControlExpandedHeightClassName = "h-9";

export function appToolbarControlBoxClassName(compact: boolean): string {
  return compact
    ? appToolbarControlCompactClassName
    : appToolbarControlExpandedClassName;
}

export function appToolbarControlHeightClassName(compact: boolean): string {
  return compact
    ? appToolbarControlCompactHeightClassName
    : appToolbarControlExpandedHeightClassName;
}

/** Horizontal page gutter — headers, toolbars, scroll content */
export const appContentGutterClassName = "px-4 sm:px-5";

/** Full inset for scrollable content wells */
export const appContentInsetClassName = "p-4 sm:p-5";
