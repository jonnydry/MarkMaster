"use client";

import { useState } from "react";

/**
 * Cursor (keyset) pages of the bookmarks API omit `total`/`totalPages` so the
 * server can skip an expensive COUNT(*). This hook carries the most recent
 * page-1 totals forward so pagination UI stays stable while paging.
 *
 * Uses the render-time setState pattern (React's sanctioned
 * derive-from-props approach) so the carried value is available in the same
 * render — an effect-based version would flash `totalPages: 1` and trip
 * page-clamping logic.
 */
export function useCarriedListTotals(response: {
  total?: number;
  totalPages?: number;
} | undefined): { total: number; totalPages: number } {
  const [carried, setCarried] = useState({ total: 0, totalPages: 1 });

  if (
    response?.total !== undefined &&
    response.totalPages !== undefined &&
    (response.total !== carried.total ||
      response.totalPages !== carried.totalPages)
  ) {
    setCarried({ total: response.total, totalPages: response.totalPages });
  }

  return {
    total: response?.total ?? carried.total,
    totalPages: response?.totalPages ?? carried.totalPages,
  };
}
