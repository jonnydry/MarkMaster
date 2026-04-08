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
