const DEFAULT_MAX_JSON_BODY_BYTES = 64 * 1024;

export type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BODY_BYTES
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: "Request body is too large",
      };
    }
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid request body",
    };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "Request body is too large",
    };
  }

  if (!text.trim()) {
    return { ok: true, data: {} };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON body",
    };
  }
}
