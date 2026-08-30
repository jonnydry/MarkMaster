const SENSITIVE_ENV_KEYS = [
  "UPSTASH_REDIS_REST_TOKEN",
  "AUTH_TWITTER_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "AUTH_TWITTER_ID",
  "ENCRYPTION_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "XAI_API_KEY",
  "SYNC_WORKER_SECRET",
  "CRON_SECRET",
];

function sanitizeLogText(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f]/g, " ");
}

function redact(input: string): string {
  const redacted = SENSITIVE_ENV_KEYS.reduce((acc, key) => {
    const value = process.env[key];
    return value ? acc.split(value).join("[REDACTED]") : acc;
  }, input);
  return sanitizeLogText(redacted);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    // The stack starts with "Name: message" and is the one thing needed to
    // debug production issues. redact() flattens control chars, so the stack
    // lands on a single injection-safe line.
    return error.stack ?? `${error.name}: ${error.message}`;
  }
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
