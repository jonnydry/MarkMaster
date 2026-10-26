/**
 * Per-request Content-Security-Policy.
 *
 * Next.js inlines the App Router bootstrap (`__next_f` and the Turbopack
 * runtime push). A static `script-src 'self'` blocks those scripts, so the
 * page paints but client handlers never attach. The proxy puts a fresh nonce
 * on the request header Next reads while rendering, and on the response the
 * browser enforces. Do not also emit a second policy without that nonce.
 *
 * `style-src` stays `'unsafe-inline'` with no nonce. A style nonce would make
 * browsers ignore `'unsafe-inline'` and drop Tailwind's inline styles.
 * `'strict-dynamic'` is omitted so first-party script URLs (`/_next`, `/theme-init`)
 * still match `'self'` when they are not themselves nonced.
 */

export type ContentSecurityPolicyHeaderName =
  | "Content-Security-Policy"
  | "Content-Security-Policy-Report-Only";

export type ContentSecurityPolicy = {
  /** Name of the header the browser should receive. */
  key: ContentSecurityPolicyHeaderName;
  value: string;
  nonce: string;
};

const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

export function createContentSecurityPolicyNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function contentSecurityPolicy(
  nonce: string,
  env: NodeJS.ProcessEnv = process.env
): ContentSecurityPolicy {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }

  const isDev = env.NODE_ENV === "development";
  const isProduction = env.NODE_ENV === "production";
  const enforce =
    env.CSP_MODE === "enforce" ||
    (isProduction && env.CSP_MODE !== "report-only");

  const value = [
    "default-src 'self'",
    // 'unsafe-eval' is only for development (Turbopack + React Refresh).
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind v4 and component libraries still emit inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://pbs.twimg.com https://abs.twimg.com",
    "media-src 'self' https://video.twimg.com https://pbs.twimg.com",
    "font-src 'self' data:",
    // Browser traffic stays first-party. X and xAI calls are server-side only.
    `connect-src 'self'${isDev ? " http: ws:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
    "report-to default",
  ].join("; ");

  return {
    key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value,
    nonce,
  };
}

export function createContentSecurityPolicy(
  env: NodeJS.ProcessEnv = process.env
): ContentSecurityPolicy {
  return contentSecurityPolicy(createContentSecurityPolicyNonce(), env);
}
