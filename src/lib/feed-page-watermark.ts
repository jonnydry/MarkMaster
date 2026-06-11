/** Routes that paint a large left-side page watermark behind chrome. */
export function hasFeedPageWatermark(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname === "/orbit" ||
    pathname === "/collections"
  );
}

/** Viewport-pinned watermark layer — sits under sidebar + feed (z-0). */
export const feedPageWatermarkShellClass =
  "pointer-events-none fixed inset-y-0 left-0 z-0 hidden w-[min(72%,34rem)] overflow-visible md:block";

/** Collections — dual marks meet head-to-head at viewport center. */
export const collectionsPageWatermarkShellClass =
  "pointer-events-none fixed inset-0 z-0 hidden items-center justify-center overflow-visible md:flex";
