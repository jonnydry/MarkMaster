/** Frosted chrome for sticky page headers and the dashboard search strip (shared visual language). */
export const appChromeFrostedClassName =
  "bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75";

/** Lighter feed-header chrome — dashboard / Orbit toolbars; background marks show through. */
export const appFeedHeaderFrostedClassName =
  "bg-background/60 backdrop-blur-md supports-[backdrop-filter]:bg-background/50";

/**
 * Compact floating search — frosted card over scrolling feed media (denser than
 * the feed header bar so thumbnails do not wash out the field).
 */
export const appFloatingSearchFrostedClassName =
  "bg-background/96 supports-[backdrop-filter]:bg-background/90 backdrop-blur-xl backdrop-saturate-150 dark:supports-[backdrop-filter]:bg-background/91";

/** Translucent wells for search bars, segments, and icon tiles in feed toolbars. */
export const appToolbarSurfaceClassName =
  "bg-background/20 supports-[backdrop-filter]:bg-background/16 backdrop-blur-sm";

export const appToolbarSurfaceShellClassName =
  "toolbar-search-shell surface-veil border-hairline-strong backdrop-blur-xl backdrop-saturate-150";

export const appToolbarSurfaceGroupClassName =
  "border-hairline-soft bg-background/20 supports-[backdrop-filter]:bg-background/16 backdrop-blur-sm";

/** Frosted shell for compact floating search over scrolling feed media. */
export const appFloatingSearchShellClassName =
  `floating-search-shell ${appFloatingSearchFrostedClassName} shadow-[0_12px_40px_-16px_color-mix(in_srgb,var(--foreground)_48%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]`;

/** Horizontal page gutter — headers, toolbars, scroll content */
export const appContentGutterClassName = "px-4 sm:px-5";

/** Full inset for scrollable content wells */
export const appContentInsetClassName = "p-4 sm:p-5";
