import path from "node:path";
import { fileURLToPath } from "node:url";
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Avoid wrong workspace root when a parent directory also has a lockfile.
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

// CSP is set per request in src/proxy.ts. A static header cannot carry the
// nonce Next.js puts on its inline bootstrap, and a second policy without
// that nonce would still block those scripts.

const securityHeaders = [
  // Required for modern Reporting API (pairs with report-to in the proxy CSP)
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
  // @tanstack/react-query benefits from explicit opt-in.
  // @base-ui/react is excluded from optimizePackageImports: its entry barrels use
  // `export * as`, which breaks Turbopack dev HMR (vercel/next.js#86714). Use
  // `npm run dev` (webpack) until upstream fixes land; `dev:turbo` is opt-in.
  experimental: {
    optimizePackageImports: [
      "@tanstack/react-query",
      "lucide-react",
      "date-fns",
    ],
  },
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 14_400,
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
            test: /[\\/]node_modules[\\/]@base-ui[\\/]react[\\/](utils[\\/]popups|floating-ui-react)[\\/]/,
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
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
