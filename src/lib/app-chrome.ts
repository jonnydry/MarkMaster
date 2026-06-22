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
  "border-hairline-strong bg-background/20 supports-[backdrop-filter]:bg-background/16 backdrop-blur-sm shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--foreground)_80%,transparent)]";

export const appToolbarSurfaceGroupClassName =
  "border-hairline-soft bg-background/20 supports-[backdrop-filter]:bg-background/16 backdrop-blur-sm";

/** Frosted shell for compact floating search over scrolling feed media. */
export const appFloatingSearchShellClassName =
  "bg-background/92 supports-[backdrop-filter]:bg-background/84 backdrop-blur-xl backdrop-saturate-150 shadow-[0_12px_40px_-16px_color-mix(in_srgb,var(--foreground)_48%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)] dark:supports-[backdrop-filter]:bg-background/88";

/** Horizontal page gutter — headers, toolbars, scroll content */
export const appContentGutterClassName = "px-4 sm:px-5";

/** Full inset for scrollable content wells */
export const appContentInsetClassName = "p-4 sm:p-5";
