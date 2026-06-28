import * as v from "valibot";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonRequestInit<
  TBody extends JsonValue = JsonValue,
  TResponse = unknown,
> = Omit<RequestInit, "body"> & {
  body?: TBody;
  schema?: v.GenericSchema<unknown, TResponse>;
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

function parseResponseBody<T>(
  body: unknown,
  schema: v.GenericSchema<unknown, T> | undefined,
  status: number
): T {
  if (!schema) {
    return body as T;
  }

  const result = v.safeParse(schema, body);
  if (!result.success) {
    throw new FetchJsonError(
      "API response did not match expected shape",
      status,
      { valibotIssues: result.issues, received: body }
    );
  }

  return result.output;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  schema: v.GenericSchema<unknown, T>
): Promise<T>;
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T>;
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  schema?: v.GenericSchema<unknown, T>
): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
  });

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

  return parseResponseBody(body, schema, res.status);
}

export function sendJson<
  TResponse,
  TBody extends JsonValue = JsonValue,
>(input: RequestInfo | URL, init: JsonRequestInit<TBody, TResponse> = {}) {
  const { body, headers, schema, ...requestInit } = init;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const request = {
    ...requestInit,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  if (schema) {
    return fetchJson<TResponse>(input, request, schema);
  }

  return fetchJson<TResponse>(input, request);
}
