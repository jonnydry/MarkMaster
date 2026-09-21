"use client";

import { formatDistanceToNow } from "date-fns";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function toValidDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Relative phrases ("about 1 month ago") differ between the server clock and
 * the browser. Render nothing until the client snapshot so hydration matches.
 */
export function useRelativeTime(
  value: Date | string | number | null | undefined
): string | null {
  const time = value == null ? null : toValidDate(value)?.getTime() ?? null;

  return useSyncExternalStore(
    subscribe,
    () =>
      time == null
        ? null
        : formatDistanceToNow(new Date(time), { addSuffix: true }),
    () => null
  );
}
