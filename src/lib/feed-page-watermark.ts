/** Routes that paint a large left-side page watermark behind chrome. */
export function hasFeedPageWatermark(pathname: string) {
  return pathname === "/dashboard" || pathname === "/orbit";
}

/** Shell-anchored watermark layer — sits under sidebar + feed (z-0). */
export const feedPageWatermarkShellClass =
  "pointer-events-none absolute inset-y-0 left-0 z-0 hidden w-[min(72%,34rem)] overflow-visible md:block";
