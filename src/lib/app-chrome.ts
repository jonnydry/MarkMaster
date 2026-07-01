/** Frosted chrome for sticky page headers and the dashboard search strip (shared visual language). */
export const appChromeFrostedClassName =
  "bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75";

/** Lighter feed-header chrome — dashboard / Orbit toolbars; background marks show through. */
export const appFeedHeaderFrostedClassName =
  "bg-background/60 backdrop-blur-md supports-[backdrop-filter]:bg-background/50";

/** Translucent wells for search bars, segments, and icon tiles in feed toolbars. */
export const appToolbarSurfaceClassName =
  "bg-background/20 supports-[backdrop-filter]:bg-background/16 backdrop-blur-sm";

export const appToolbarSurfaceShellClassName =
  "toolbar-search-shell surface-veil border-hairline-strong backdrop-blur-xl backdrop-saturate-150";

export const appToolbarSurfaceGroupClassName =
  "border-hairline-soft bg-background/20 supports-[backdrop-filter]:bg-background/16 backdrop-blur-sm";

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
