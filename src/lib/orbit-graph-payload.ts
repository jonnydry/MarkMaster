import { orbitGraphPayloadSchema } from "@/lib/api-response-schemas";
import type { OrbitGraphPayload } from "@/types";
import * as v from "valibot";

function isOrbitGraphPayloadShape(body: unknown): body is OrbitGraphPayload {
  if (!body || typeof body !== "object") return false;
  const payload = body as Partial<OrbitGraphPayload>;
  return (
    Array.isArray(payload.nodes) &&
    Array.isArray(payload.edges) &&
    typeof payload.generatedAt === "string" &&
    typeof payload.nodeCap === "number" &&
    typeof payload.stats === "object" &&
    payload.stats !== null
  );
}

/**
 * Production graph payloads are already validated on the server. Skip the
 * full Valibot walk of every node/edge on the client hot path; keep it in
 * development so schema drift still fails tests and local fetches.
 */
export function readOrbitGraphPayload(body: unknown): OrbitGraphPayload {
  if (process.env.NODE_ENV !== "production") {
    const parsed = v.safeParse(orbitGraphPayloadSchema, body);
    if (!parsed.success) {
      throw new Error("Orbit graph response did not match expected shape");
    }
    return parsed.output;
  }

  if (!isOrbitGraphPayloadShape(body)) {
    throw new Error("Orbit graph response did not match expected shape");
  }
  return body;
}
