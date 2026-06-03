/**
 * Phase 3 Item 12 Slice 1 — Core Flywheel Instrumentation (lightweight, elegant, non-intrusive)
 *
 * Client-side fire-and-forget tracker for high-signal flywheel events only.
 * Uses sendBeacon when available for reliability (survives navigation), falls back to
 * non-awaited sendJson. All failures are silent — measurement must never impact UX or add weight.
 *
 * Events logged:
 *  - cta.review_in_orbit (from Highlights cards, Digest individuals, Library Control Center)
 *  - cta.digest_review_together (the "Review these together" ritual CTA)
 *  - feedback.good / feedback.not_relevant (via the shared highlight-feedback lib)
 *  - mode.quick / mode.deep (toggles + keyboard in review dialog)
 *  - digest.session_start (when a digest batch review session begins from URL intent)
 *  - quick.keep (Slice 3: lightweight outcome signal when a keep decision is recorded while Quick Pass is active)
 *  - orbit.scan.completed / orbit.scan.failed / orbit.review.applied (adaptive Orbit batch quality)
 *
 * Stored via /api/flywheel (best-effort), aggregated in /api/analytics for the basic view.
 * Easy to extend in Slice 2/3 (source grouping, outcome derivation) while remaining zero-UX-impact.
 */

import { sendJson, type JsonValue } from "./fetch-json";

export type FlywheelEventType =
  | "cta.review_in_orbit"
  | "cta.digest_review_together"
  | "feedback.good"
  | "feedback.not_relevant"
  | "mode.quick"
  | "mode.deep"
  | "digest.session_start"
  | "quick.keep"
  | "orbit.scan.completed"
  | "orbit.scan.failed"
  | "orbit.review.applied";

export function trackFlywheelEvent(
  eventType: FlywheelEventType,
  payload?: JsonValue
) {
  if (typeof window === "undefined") return;

  const body = { eventType, payload: payload ?? null };

  try {
    // Prefer sendBeacon: reliable, non-blocking, works on page unload / navigation
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      navigator.sendBeacon("/api/flywheel", blob);
      return;
    }

    // Fallback: fire-and-forget (errors swallowed)
    sendJson("/api/flywheel", { method: "POST", body }).catch(() => {
      /* instrumentation must not surface errors */
    });
  } catch {
    /* graceful no-op — never break the elegant experience */
  }
}
