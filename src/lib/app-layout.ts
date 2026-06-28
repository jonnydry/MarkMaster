import { cn } from "@/lib/utils";

/** Full-height authenticated page shell — sidebar + main column. */
export const appPageShellClassName =
  "app-shell-bg app-viewport relative flex h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden";

/** Desktop sidebar column inside the page shell. */
export const appPageSidebarClassName =
  "relative z-10 hidden h-full min-h-0 shrink-0 overflow-hidden md:block";

/** Main content column — must stay flex-shrinkable on narrow viewports. */
export const appPageMainClassName =
  "relative z-[1] flex h-full min-h-0 min-w-0 flex-1 flex-col";

/** Primary scroll region for feed-style pages (header scrolls with content). */
export const appPageScrollClassName =
  "app-main-scroll relative z-[1] h-full min-h-0 min-w-0 overflow-x-hidden scrollbar-thin";

/** Full-viewport centered states (loading, error, empty). */
export const appPageCenterClassName = cn(
  appPageShellClassName,
  "items-center justify-center"
);

/** Column layout without an inner scroll wrapper (Orbit map). */
export const appPageMainColumnClassName =
  "relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col";

/** Fixed full-viewport wrapper for authenticated app chrome. */
export const appFixedViewportClassName =
  "app-fixed-viewport fixed inset-x-0 top-0 overflow-hidden";

/** Minimum full-viewport height for scrollable public/marketing pages. */
export const appMinViewportClassName = "app-min-viewport min-w-0";

/** Public page shell — natural document scroll with horizontal containment. */
export const appPublicPageClassName = cn(
  appMinViewportClassName,
  "flex flex-col overflow-x-hidden"
);

/** Frosted backdrop for large bookmark/review overlays. */
export const appOverlayBackdropClassName =
  "bg-background/35 supports-backdrop-filter:backdrop-blur-xl dark:bg-black/45";

/** Large overlay dialog shell (bookmark overlay). */
export const appOverlayDialogBookmarkClassName = cn(
  "app-overlay-dialog surface-overlay p-0 max-w-[1120px] sm:max-w-[1120px]"
);

/** Large overlay dialog shell (Orbit review). */
export const appOverlayDialogReviewClassName = cn(
  "app-overlay-dialog surface-overlay p-0 max-w-[1180px] sm:max-w-[1180px]"
);

/** Small overlay dialog shell (keyboard shortcuts, etc.). */
export const appOverlayDialogSmClassName = cn(
  "app-overlay-dialog-sm surface-overlay p-0"
);

/** Two-column overlay grid — bookmark overlay sidebar width.
 * Mobile stacks (1 col, 2 rows): main flexible + sidebar auto-sized.
 * Desktop: side-by-side in a single row.
 */
export const appOverlayDialogGridBookmarkClassName = cn(
  "app-overlay-dialog-grid grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]"
);

/** Two-column overlay grid — Orbit review sidebar width. */
export const appOverlayDialogGridReviewClassName = cn(
  "app-overlay-dialog-grid grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)]"
);

/** Floating panel over the Orbit map canvas (mobile rail). */
export const appOverlayPanelClassName = "app-overlay-panel";
