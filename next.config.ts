import path from "node:path";
import { fileURLToPath } from "node:url";
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Avoid wrong workspace root when a parent directory also has a lockfile.
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  // The theme bootstrap is served as a first-party script route, so script-src can stay self-only.
  // 'unsafe-eval' is only allowed in development (Turbopack + React Refresh).
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
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
  "report-to default",
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
      "accelerometer=(), ambient-light-sensor=(), battery=(), bluetooth=(), camera=(), " +
      "display-capture=(), document-domain=(), fullscreen=(self), gamepad=(), " +
      "geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), " +
      "midi=(), payment=(), picture-in-picture=(self), publickey-credentials-get=(), screen-wake-lock=(), " +
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
  // lucide-react and date-fns are optimized by default in Next.js 16.
  // @base-ui/react and @tanstack/react-query benefit from explicit opt-in.
  experimental: {
    optimizePackageImports: [
      "@tanstack/react-query",
      "lucide-react",
      "date-fns",
      "@base-ui/react",
    ],
  },
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 80, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
    ],
  },
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      // PixiJS only exposes init side-effect packages in its exports map.
      // The Orbit worker imports the classes it needs from internal files so
      // the full `pixi.js` entry (filters, accessibility, assets, WebGPU, etc.)
      // is not bundled. This alias lets webpack resolve those internal paths.
      "pixi.js/lib": path.resolve(turbopackRoot, "node_modules/pixi.js/lib"),
    };

    // The @base-ui popup/floating-ui internals are duplicated across many route
    // chunks because Dialog/Menu/Select/Tooltip each pull them in. Force them
    // into one shared client chunk so the browser only downloads them once.
    if (!isServer) {
      const existing = config.optimization.splitChunks;
      const splitChunks =
        typeof existing === "object" && existing !== null ? existing : {};
      const cacheGroups =
        typeof splitChunks.cacheGroups === "object" &&
        splitChunks.cacheGroups !== null
          ? splitChunks.cacheGroups
          : {};

      config.optimization.splitChunks = {
        ...splitChunks,
        cacheGroups: {
          ...cacheGroups,
          baseUiPopup: {
            test: /[\\/]node_modules[\\/]@base-ui[\\/]react[\\/]esm[\\/](utils[\\/]popups|floating-ui-react)[\\/]/,
            name: "base-ui-popup",
            chunks: "all",
            priority: 20,
          },
        },
      };
    }

    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Long-lived cache for hashed static assets — production only. In dev,
      // Next.js manages these routes and custom Cache-Control breaks HMR.
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/_next/static/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
            {
              source: "/_next/image/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ]
        : []),
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
