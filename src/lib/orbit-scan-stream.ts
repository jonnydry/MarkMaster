import { FetchJsonError, readFetchJsonError } from "@/lib/fetch-json";
import type {
  OrbitScanBatchMetadata,
  OrbitScanPhase,
  OrbitScanProgressEvent,
  OrbitScanResponsePayload,
  OrbitScanStreamLine,
} from "@/types";

/** Where one bookmark is in a running scan. */
export type OrbitScanRowState = "matching" | "matched" | "naming" | "named";

export interface OrbitScanRowProgress {
  state: OrbitScanRowState;
  /** First matched tag or collection, as a preview until the plan lands. */
  label: string | null;
}

export interface OrbitScanProgress {
  phase: OrbitScanPhase;
  total: number;
  /** Rows with an answer: matched by Jev or named by Grok. */
  resolved: number;
  /** Rows waiting on Grok. */
  naming: number;
  rows: ReadonlyMap<string, OrbitScanRowProgress>;
}

/** Calls `onLine` with each parsed line as it arrives. A throwing `onLine` cancels the stream. */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onLine: (line: unknown) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = (final: boolean) => {
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const text = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (text) onLine(JSON.parse(text));
      newline = buffer.indexOf("\n");
    }
    if (final && buffer.trim()) {
      const text = buffer;
      buffer = "";
      onLine(JSON.parse(text));
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain(false);
    }
    buffer += decoder.decode();
    drain(true);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}

/**
 * POSTs a streamed scan and resolves with its result. Failures throw the same
 * `FetchJsonError` shape as `sendJson`, so scan failure handling is shared.
 */
export async function requestOrbitScanStream(args: {
  bookmarkIds: string[];
  batch?: OrbitScanBatchMetadata;
  onProgress?: (event: OrbitScanProgressEvent) => void;
}): Promise<OrbitScanResponsePayload> {
  const response = await fetch("/api/orbit/scan", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "scan",
      bookmarkIds: args.bookmarkIds,
      stream: true,
      ...(args.batch ? { batch: args.batch } : {}),
    }),
  });
  if (!response.ok) throw await readFetchJsonError(response);
  if (!response.body) {
    throw new FetchJsonError("Orbit scan returned no response.", 502, null);
  }

  const outcome: { result: OrbitScanResponsePayload | null } = { result: null };
  await readNdjson(response.body, (raw) => {
    const line = raw as OrbitScanStreamLine;
    if (line.type === "result") {
      outcome.result = line.payload;
    } else if (line.type === "error") {
      throw new FetchJsonError(line.error.error, line.status, line.error);
    } else {
      args.onProgress?.(line);
    }
  });

  if (!outcome.result) {
    throw new FetchJsonError("Orbit scan stopped before it finished. Try again.", 502, {
      error: "Orbit scan stopped before it finished. Try again.",
      code: "unknown",
    });
  }
  return outcome.result;
}

export function startOrbitScanProgress(bookmarkIds: string[]): OrbitScanProgress {
  return {
    phase: "prepare",
    total: bookmarkIds.length,
    resolved: 0,
    naming: 0,
    rows: new Map(
      bookmarkIds.map((id) => [id, { state: "matching" as const, label: null }])
    ),
  };
}

export function applyOrbitScanProgressEvent(
  progress: OrbitScanProgress,
  event: OrbitScanProgressEvent
): OrbitScanProgress {
  const rows = new Map(progress.rows);
  const set = (id: string, row: OrbitScanRowProgress) => {
    if (rows.has(id)) rows.set(id, row);
  };

  if (event.type === "phase" && event.phase === "name") {
    for (const id of event.bookmarkIds ?? [...rows.keys()]) {
      set(id, { state: "naming", label: null });
    }
  } else if (event.type === "row" && event.state === "matched") {
    set(event.bookmarkId, { state: "matched", label: event.label });
  } else if (event.type === "named") {
    for (const id of event.bookmarkIds) set(id, { state: "named", label: null });
  }
  // Leftover rows keep "matching": a re-check or Grok naming comes next.

  let resolved = 0;
  let naming = 0;
  for (const row of rows.values()) {
    if (row.state === "matched" || row.state === "named") resolved += 1;
    else if (row.state === "naming") naming += 1;
  }

  return {
    phase: event.type === "phase" ? event.phase : progress.phase,
    total: progress.total,
    resolved,
    naming,
    rows,
  };
}

/** 0–1 once a row has an answer; null (indeterminate) before that. */
export function orbitScanProgressRatio(progress: OrbitScanProgress | null) {
  if (!progress || progress.total === 0 || progress.resolved === 0) return null;
  return progress.resolved / progress.total;
}

/** One line of scan status for the Orbit banner. */
export function orbitScanProgressDetail(progress: OrbitScanProgress) {
  const matched = `${progress.resolved.toLocaleString()} of ${progress.total.toLocaleString()} matched`;
  const open = progress.total - progress.resolved;
  switch (progress.phase) {
    case "prepare":
      return "Reading posts and your tagging history…";
    case "match":
      return `${matched} to your tags`;
    case "refine":
      return `${matched} · re-checking ${open.toLocaleString()} against this batch's tags`;
    case "name":
      return progress.resolved > 0
        ? `${matched} · Grok is naming ${progress.naming.toLocaleString()}`
        : `Grok is naming ${progress.naming.toLocaleString()}`;
  }
}
