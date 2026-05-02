export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonRequestInit<TBody extends JsonValue = JsonValue> = Omit<
  RequestInit,
  "body"
> & {
  body?: TBody;
};

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : typeof body === "string" && body
          ? body
          : `Request failed with status ${res.status}`;

    throw new Error(message);
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
