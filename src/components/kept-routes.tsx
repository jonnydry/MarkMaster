"use client";

import {
  Component,
  memo,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";

import { AppRouteError } from "@/components/app-route-error";
import { PageActiveProvider } from "@/components/page-activity";

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
  return (
    <div
      className={active ? "contents" : "hidden"}
      hidden={active ? undefined : true}
      inert={active ? undefined : true}
    >
      <PageActiveProvider active={active}>
        <KeptRouteErrorBoundary>{children}</KeptRouteErrorBoundary>
      </PageActiveProvider>
    </div>
  );
}

export function isKeptRoute(pathname: string) {
  return KEPT_ROUTES.some((route) => route.href === pathname);
}

/**
 * Sidebar destinations stay mounted after the first visit. Later clicks only
 * show or hide them, so the page does not render from scratch again.
 */
export function KeptRoutes({ pathname }: { pathname: string }) {
  const [warm, setWarm] = useState<ReadonlySet<string>>(() => new Set([pathname]));

  useEffect(() => {
    let index = 0;
    let timer = 0;
    const step = () => {
      const href = KEPT_ROUTES[index]?.href;
      index += 1;
      if (!href) return;
      setWarm((current) => {
        if (current.has(href)) return current;
        const next = new Set(current);
        next.add(href);
        return next;
      });
      timer = window.setTimeout(step, 500);
    };
    timer = window.setTimeout(step, 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !focused.closest("[hidden]")) return;
    document.getElementById("app-main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      {KEPT_ROUTES.map((route) => (
        <KeptRoute
          key={route.href}
          active={pathname === route.href}
          mounted={pathname === route.href || warm.has(route.href)}
        >
          {route.slot}
        </KeptRoute>
      ))}
    </>
  );
}
