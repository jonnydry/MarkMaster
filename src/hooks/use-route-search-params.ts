"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Search params for a page that stays mounted (hidden) on other routes: the
 * query last seen while `route` was showing. Other pages' queries (?tag=,
 * ?tab=, map selection) never read as this page's URL state.
 */
export function useRouteSearchParams(route: string): URLSearchParams {
  const onRoute = usePathname() === route;
  const routeSearch = useSearchParams()?.toString() ?? "";
  const [search, setSearch] = useState(onRoute ? routeSearch : "");
  if (onRoute && search !== routeSearch) {
    setSearch(routeSearch);
  }
  return useMemo(() => new URLSearchParams(search), [search]);
}
