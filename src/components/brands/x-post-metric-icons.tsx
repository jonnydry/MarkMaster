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
      <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.185 8.129 7.11 0 3.9-2.855 6.57-6.927 7.095v-2.27c2.848-.39 4.777-2.14 4.777-4.825 0-2.825-2.66-5.11-6.129-5.11H9.756c-2.855 0-5.005 2.15-5.005 4.8 0 2.5 1.85 4.45 4.255 4.825v2.27C4.855 17.905 1.751 14.305 1.751 10z" />
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
      <path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v12.13h4.75v2.5H3.513v-14.75L1.853 9.91.147 8.09l4.603-4.3zm14.51 2.71h5.614c2.061 0 3.75 1.69 3.75 3.75v14.75h-8.238v-2.5h5.488V10.25a1.25 1.25 0 0 0-1.118-1.243l-.132-.007H19.25V6.5z" />
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
