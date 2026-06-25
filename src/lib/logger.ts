const SENSITIVE_ENV_KEYS = [
  "UPSTASH_REDIS_REST_TOKEN",
  "AUTH_TWITTER_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "AUTH_TWITTER_ID",
  "ENCRYPTION_KEY",
];

function redact(input: string): string {
  return SENSITIVE_ENV_KEYS.reduce((acc, key) => {
    const value = process.env[key];
    return value ? acc.split(value).join("[REDACTED]") : acc;
  }, input);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function logError(context: string, message: string, error?: unknown): void {
  if (process.env.NODE_ENV === "test") return;
  const parts: string[] = [`[${context}] ${message}`];
  if (error !== undefined) {
    parts.push(redact(formatError(error)));
  }
  console.error(...parts);
}

export function logWarn(context: string, message: string, extra?: unknown): void {
  if (process.env.NODE_ENV === "test") return;
  const parts: string[] = [`[${context}] ${message}`];
  if (extra !== undefined) {
    parts.push(redact(typeof extra === "string" ? extra : JSON.stringify(extra)));
  }
  console.warn(...parts);
}
