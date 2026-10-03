"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Search string last seen while a route was the URL. Hidden kept pages read
 * this frozen value, so another page's query never becomes their URL state
 * and does not re-render them. The live `useSearchParams` subscription is the
 * provider, once — not each page.
 */
type RouteSearchStore = {
  publish: (pathname: string, search: string) => void;
  subscribe: (listener: () => void) => () => void;
  notify: () => void;
  snapshot: (route: string) => string;
};

const RouteSearchStoreContext = createContext<RouteSearchStore | null>(null);

function createRouteSearchStore(): RouteSearchStore {
  let pathname = "";
  let search = "";
  const frozen = new Map<string, string>();
  const listeners = new Set<() => void>();

  return {
    publish(nextPathname, nextSearch) {
      if (pathname === nextPathname && search === nextSearch) return;
      pathname = nextPathname;
      search = nextSearch;
      frozen.set(nextPathname, nextSearch);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
    snapshot(route) {
      if (pathname === route) {
        const current = frozen.get(route);
        if (current === search) return current;
        frozen.set(route, search);
        return search;
      }
      const cached = frozen.get(route);
      if (cached !== undefined) return cached;
      frozen.set(route, "");
      return "";
    },
  };
}

function RouteSearchPublisher() {
  const store = useContext(RouteSearchStoreContext);
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";

  if (store) store.publish(pathname, search);

  useLayoutEffect(() => {
    store?.notify();
  }, [store, pathname, search]);

  return null;
}

export function RouteSearchParamsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createRouteSearchStore);

  return (
    <RouteSearchStoreContext.Provider value={store}>
      <RouteSearchPublisher />
      {children}
    </RouteSearchStoreContext.Provider>
  );
}

export function useRouteSearchParams(route: string): URLSearchParams {
  const store = useContext(RouteSearchStoreContext);
  if (!store) {
    throw new Error(
      "useRouteSearchParams must be used inside RouteSearchParamsProvider"
    );
  }

  const search = useSyncExternalStore(
    store.subscribe,
    () => store.snapshot(route),
    () => store.snapshot(route)
  );

  return useMemo(() => new URLSearchParams(search), [search]);
}
