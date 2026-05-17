export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonRequestInit<TBody extends JsonValue = JsonValue> = Omit<
  RequestInit,
  "body"
> & {
  body?: TBody;
};

export class FetchJsonError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "FetchJsonError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    let message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : typeof body === "string" && body
          ? body
          : `Request failed with status ${res.status}`;

    // Special handling for rate limits
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      message = retryAfter
        ? `Rate limit exceeded. Please try again in ${retryAfter} seconds.`
        : "Rate limit exceeded. Please slow down and try again later.";
    }

    throw new FetchJsonError(message, res.status, body);
  }

  return body as T;
}

export function sendJson<TResponse, TBody extends JsonValue = JsonValue>(
  input: RequestInfo | URL,
  init: JsonRequestInit<TBody> = {}
) {
  const { body, headers, ...requestInit } = init;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  return fetchJson<TResponse>(input, {
    ...requestInit,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
