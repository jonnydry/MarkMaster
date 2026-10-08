import type { OrbitDecisionEventPayload } from "@/types";

export const DECISION_EVENT_BATCH_MAX_EVENTS = 100;
export const DECISION_EVENT_BODY_LIMIT_BYTES = 64 * 1024;
export const DECISION_EVENT_BATCH_BYTE_BUDGET = DECISION_EVENT_BODY_LIMIT_BYTES - 8 * 1024;

export function decisionEventBodyBytes(events: OrbitDecisionEventPayload[]) {
  return new TextEncoder().encode(JSON.stringify({ events })).length;
}

export function chunkDecisionEvents(
  events: OrbitDecisionEventPayload[]
): OrbitDecisionEventPayload[][] {
  const batches: OrbitDecisionEventPayload[][] = [];
  let offset = 0;
  while (offset < events.length) {
    const batch: OrbitDecisionEventPayload[] = [];
    while (
      offset + batch.length < events.length &&
      batch.length < DECISION_EVENT_BATCH_MAX_EVENTS
    ) {
      const next = events[offset + batch.length];
      if (!next) break;
      if (
        batch.length > 0 &&
        decisionEventBodyBytes(batch.concat(next)) >= DECISION_EVENT_BATCH_BYTE_BUDGET
      ) {
        break;
      }
      batch.push(next);
    }
    if (batch.length === 0) break;
    offset += batch.length;
    batches.push(batch);
  }
  return batches;
}
