"use client";

import {
  Activity,
  Component,
  memo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";

import { AppRouteError } from "@/components/app-route-error";
import { PageActiveProvider } from "@/components/page-activity";
import { RouteSearchParamsProvider } from "@/hooks/use-route-search-params";
import { prefetchAppRoute } from "@/lib/prefetch-app-route";

const DashboardClient = dynamic(
  () => import("@/app/(main)/dashboard/dashboard-client")
);
const OrbitClient = dynamic(() => import("@/app/(main)/orbit/orbit-client"));
const CollectionsClient = dynamic(
  () => import("@/app/(main)/collections/collections-client")
);
const AnalyticsClient = dynamic(
  () => import("@/app/(main)/analytics/analytics-client")
);
const SettingsClient = dynamic(
  () => import("@/app/(main)/settings/settings-client")
);

const DashboardSlot = memo(function DashboardSlot() {
  return <DashboardClient />;
});
const OrbitSlot = memo(function OrbitSlot() {
  return <OrbitClient />;
});
const CollectionsSlot = memo(function CollectionsSlot() {
  return <CollectionsClient />;
});
const AnalyticsSlot = memo(function AnalyticsSlot() {
  return <AnalyticsClient />;
});
const SettingsSlot = memo(function SettingsSlot() {
  return <SettingsClient />;
});

const KEPT_ROUTES: { href: string; slot: ReactNode }[] = [
  { href: "/dashboard", slot: <DashboardSlot /> },
  { href: "/orbit", slot: <OrbitSlot /> },
  { href: "/collections", slot: <CollectionsSlot /> },
  { href: "/analytics", slot: <AnalyticsSlot /> },
  { href: "/settings", slot: <SettingsSlot /> },
];

const MODULE_LOADERS = [
  () => import("@/app/(main)/dashboard/dashboard-client"),
  () => import("@/app/(main)/orbit/orbit-client"),
  () => import("@/app/(main)/collections/collections-client"),
  () => import("@/app/(main)/analytics/analytics-client"),
  () => import("@/app/(main)/settings/settings-client"),
];

class KeptRouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: (Error & { digest?: string }) | null }
> {
  state = { error: null as (Error & { digest?: string }) | null };

  static getDerivedStateFromError(error: Error & { digest?: string }) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <AppRouteError
          error={this.state.error}
          reset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function KeptRoute({
  active,
  mounted,
  children,
}: {
  active: boolean;
  mounted: boolean;
  children: ReactNode;
}) {
  if (!mounted) return null;
  // A hidden Activity keeps the page's state and DOM but unmounts its effects
  // (listeners, observers, query subscriptions, polls) and renders its updates
  // only when the browser is idle, so pages off screen never compete with the
  // one on screen. Showing it remounts effects; stale queries refetch then.
  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <PageActiveProvider active={active}>
        <KeptRouteErrorBoundary>{children}</KeptRouteErrorBoundary>
      </PageActiveProvider>
    </Activity>
  );
}

export function isKeptRoute(pathname: string) {
  return KEPT_ROUTES.some((route) => route.href === pathname);
}

/**
 * Sidebar destinations stay mounted after the first visit. Later clicks only
 * show or hide them, so the page does not render from scratch again.
 *
 * Outside development, unvisited destinations are pre-rendered hidden shortly
 * after load. A hidden page runs no effects, so it can't load its own data;
 * each warm-up step prefetches the page's main data instead, and the rest
 * loads on first show.
 *
 * Development skips that warm-up. Webpack compiles one route at a time, and
 * mounting every page up front makes the click wait behind compiles the user
 * did not ask for. A page stays mounted once it has been opened.
 */
export function KeptRoutes({ pathname }: { pathname: string }) {
  const queryClient = useQueryClient();
  const [warm, setWarm] = useState<ReadonlySet<string>>(() => new Set([pathname]));
  // The warm set is only read inside the warm-up effect. Skip routes already
  // warm — the page on screen at mount (including a deep link) and routes
  // opened in development — so we don't fetch the default queue for a page
  // that isn't showing that query.
  const warmRef = useRef(warm);

  if (process.env.NODE_ENV === "development" && !warm.has(pathname)) {
    const next = new Set(warm);
    next.add(pathname);
    setWarm(next);
  }

  // Mirror warm into the ref after commit. The development branch above
  // updates state during render; writing the ref there is invalid, and the
  // warm-up timers read this after effects have run.
  useEffect(() => {
    warmRef.current = warm;
  }, [warm]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    let index = 0;
    let timer = 0;
    const step = () => {
      const href = KEPT_ROUTES[index]?.href;
      index += 1;
      if (!href) return;
      if (!warmRef.current.has(href)) {
        prefetchAppRoute(queryClient, href);
        const next = new Set(warmRef.current);
        next.add(href);
        warmRef.current = next;
        setWarm(next);
      }
      timer = window.setTimeout(step, 500);
    };
    timer = window.setTimeout(step, 700);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    let index = 0;
    let timer = 0;
    const step = () => {
      const load = MODULE_LOADERS[index];
      index += 1;
      if (!load) return;
      void load().finally(() => {
        timer = window.setTimeout(step, 40);
      });
    };
    timer = window.setTimeout(step, 300);
    return () => window.clearTimeout(timer);
  }, []);

  // Focus left inside a page that was just hidden is lost (the browser drops
  // it to <body>, possibly a frame later); hand it to the page now on screen.
  // Not on first load: Tab should still reach the skip link first.
  const focusPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname === focusPathRef.current) return;
    focusPathRef.current = pathname;
    const focused = document.activeElement;
    const focusLost =
      !focused ||
      focused === document.body ||
      // Hidden Activity content is display:none, so it has no boxes.
      focused.getClientRects().length === 0;
    if (!focusLost) return;
    document.getElementById("app-main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <RouteSearchParamsProvider>
      {KEPT_ROUTES.map((route) => (
        <KeptRoute
          key={route.href}
          active={pathname === route.href}
          mounted={pathname === route.href || warm.has(route.href)}
        >
          {route.slot}
        </KeptRoute>
      ))}
    </RouteSearchParamsProvider>
  );
}
