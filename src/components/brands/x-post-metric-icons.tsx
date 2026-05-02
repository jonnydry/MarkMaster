/** Default post-action glyph fill from X Web Intents / display docs (#AAB8C2). */
export const X_POST_METRIC_ICON_CLASS =
  "size-3.5 shrink-0 text-[#AAB8C2]" as const;

/**
 * Reply / repost / like silhouettes matching X “tweet action” affordances; use
 * the documented default gray. Official bitmaps: developer.x.com Web Intents image resources.
 */
export function XPostReplyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M1.751 12.5C1.751 7.39 5.89 3.25 11 3.25h2c5.25 0 9.5 3.73 9.5 8.33 0 3.06-1.89 5.73-4.72 6.82v1.71c0 .55-.45 1-1 1-.24 0-.47-.11-.62-.3l-1.88-2.51c-1.13.29-2.33.45-3.55.45-5.11 0-9.25-3.73-9.25-8.25z" />
    </svg>
  );
}

export function XPostRepostIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.13h4.75v2.5H3.513v-9.75L1.853 9.91.147 8.09l4.603-4.3zm14.5 16.42l-4.603-4.3 1.706-1.82L18 15.62V8.49h-4.75v-2.5h7.237v9.75l1.66-1.55 1.706 1.82-4.603 4.3z" />
    </svg>
  );
}

export function XPostLikeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M11.645 20.91v-.003l-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.924-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17l-.021.012-.028.014z" />
    </svg>
  );
}
