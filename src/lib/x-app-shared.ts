/**
 * Public hosted app (Vercel preview and production).
 * Local dev, tests, and self-hosted single-tenant installs are bootstrap:
 * AUTH_TWITTER_* is that install's X app. On Vercel it is the owner fallback only.
 */
export function isPublicHostedRuntime(): boolean {
  return process.env.VERCEL === "1";
}

/** Public account has no stored X app, and the host app must not be used. */
export const X_APP_CREDENTIALS_REQUIRED = "X_APP_CREDENTIALS_REQUIRED";

/** Settings anchor for the fail-closed prompt. */
export const X_APP_SETTINGS_PATH = "/settings?xApp=required#sync";

export const X_APP_CREDENTIALS_REQUIRED_MESSAGE =
  "Add your X Developer app client ID and secret in Settings. MarkMaster will not use the host app for this account.";

/**
 * Provider client used when this request is not an X authorize or token
 * exchange, or when a public account is not allowed to call X yet.
 * Not a secret. Never equal to AUTH_TWITTER_ID / AUTH_TWITTER_SECRET.
 * Auth.js still needs a provider object to read sessions.
 */
export const UNCONFIGURED_X_OAUTH_CLIENT = {
  clientId: "markmaster-x-app-unconfigured",
  clientSecret: "markmaster-x-app-unconfigured",
} as const;
