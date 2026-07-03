"use client";

import { useServerInsertedHTML } from "next/navigation";

/**
 * Theme bootstrap before paint — injected via SSR flush, not React's client tree,
 * so React 19 does not warn about `<script>` inside components.
 * Script body is served from `/theme-init` to keep `script-src 'self'` tight.
 */
export function ThemeInitScript() {
  useServerInsertedHTML(() => (
    // Blocking first-party bootstrap — must run before paint to prevent theme FOUC.
    // eslint-disable-next-line @next/next/no-sync-scripts -- external `/theme-init` keeps script-src self-only
    <script id="markmaster-theme-init" src="/theme-init" />
  ));

  return null;
}
