import { describe, expect, it } from "vitest";
import {
  getRetryAfterSeconds,
  getSyncRetryUntil,
  SYNC_MIN_INTERVAL_MS,
} from "./sync-throttle";

const now = new Date("2026-05-07T12:00:00.000Z");

describe("sync throttle helpers", () => {
  it("holds completed syncs until the cooldown expires", () => {
    const completedAt = new Date(now.getTime() - 2 * 60 * 1000);

    expect(
      getSyncRetryUntil(
        {
          status: "COMPLETED",
          startedAt: new Date(now.getTime() - 3 * 60 * 1000),
          completedAt,
          rateLimitResetsAt: null,
        },
        now
      )
    ).toEqual(new Date(completedAt.getTime() + SYNC_MIN_INTERVAL_MS));
  });

  it("honors provider rate-limit reset times beyond the local cooldown", () => {
    const providerReset = new Date(now.getTime() + 20 * 60 * 1000);

    expect(
      getSyncRetryUntil(
        {
          status: "RATE_LIMITED",
          startedAt: new Date(now.getTime() - 3 * 60 * 1000),
          completedAt: new Date(now.getTime() - 2 * 60 * 1000),
          rateLimitResetsAt: providerReset,
        },
        now
      )
    ).toEqual(providerReset);
  });

  it("allows a new sync after cooldown and provider reset have passed", () => {
    expect(
      getSyncRetryUntil(
        {
          status: "RATE_LIMITED",
          startedAt: new Date(now.getTime() - 30 * 60 * 1000),
          completedAt: new Date(now.getTime() - 20 * 60 * 1000),
          rateLimitResetsAt: new Date(now.getTime() - 5 * 60 * 1000),
        },
        now
      )
    ).toBeNull();
  });

  it("rounds retry-after seconds up", () => {
    expect(getRetryAfterSeconds(new Date(now.getTime() + 1001), now)).toBe(2);
  });
});
