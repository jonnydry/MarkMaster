import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import crypto from "node:crypto";
import { THEME_INIT_SCRIPT } from "./src/lib/theme-init";

// Avoid wrong workspace root when a parent directory also has a lockfile.
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

// Compute SHA-256 hash of the theme initialization script for CSP
// This allows us to remove 'unsafe-inline' from script-src while keeping the FOUC-prevention script.
const THEME_SCRIPT_HASH =
  "sha256-" + crypto.createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64");

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' removed from script-src by using a hash for the single known inline script.
  // 'unsafe-eval' is only allowed in development (Turbopack + React Refresh).
  `script-src 'self' '${THEME_SCRIPT_HASH}'${isDev ? " 'unsafe-eval'" : ""}`,
  // 'unsafe-inline' for styles is still required due to Tailwind v4 + shadcn/ui.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://pbs.twimg.com https://abs.twimg.com",
  "media-src 'self' https://video.twimg.com https://pbs.twimg.com",
  "font-src 'self' data:",
  // API connections needed for X (Twitter) and xAI (Grok/Orbit)
  `connect-src 'self' https://api.x.ai https://api.twitter.com https://x.com https://twitter.com${
    isDev ? " http: ws:" : ""
  }`,
  // Required for the high-performance PixiJS Orbit Map Web Worker (blob: workers)
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://x.com https://twitter.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  // Report violations to our endpoint (see /api/csp-report)
  "report-to default;",
].join("; ");

// === CSP Strategy ===
//
// We default to Report-Only so we can observe real violation data (via the
// protected /api/csp-report and /debug/rate-limits tools) without breaking the
// app. Flip to enforcing mode per-environment by setting CSP_MODE=enforce
// (e.g. in Vercel project env vars) once violation reports are clean. This is a
// pure config toggle with instant rollback — no code change or redeploy of the
// app logic required.
const cspEnforce = process.env.CSP_MODE === "enforce";
const cspHeaderKey = cspEnforce
  ? "Content-Security-Policy"
  : "Content-Security-Policy-Report-Only";

const securityHeaders = [
  {
    key: cspHeaderKey,
    value: contentSecurityPolicy,
  },
  // Required for modern Reporting API (pairs with report-to in CSP)
  {
    key: "Reporting-Endpoints",
    value: 'default="/api/csp-report"',
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), bluetooth=(), camera=(), " +
      "display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), gamepad=(), " +
      "geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), " +
      "midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), " +
      "serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // HSTS - Force HTTPS for 1 year (only in production)
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
  // Helps mitigate some cross-origin attacks and Spectre-class issues
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
