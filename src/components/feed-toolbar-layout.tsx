"use client";

import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";

import {
  appContentGutterClassName,
  appFeedHeaderFrostedClassName,
  appToolbarSurfaceShellClassName,
} from "@/lib/app-chrome";
import { highlightSearchShellClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

/** Horizontal scroll without visible scrollbar — feed toolbar rows. */
export const feedToolbarScrollClassName =
  "overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Pass compact toolbar sizing into a `MobileSidebar` element. */
export function withCompactToolbarSidebar(
  node: ReactNode,
  compactToolbar: boolean
): ReactNode {
  if (!isValidElement(node)) return node;
  return cloneElement(node as ReactElement<{ compactToolbar?: boolean }>, {
    compactToolbar,
  });
}

export function FeedSearchFieldShell({
  children,
  className,
  /** Skip toolbar well chrome when nested inside CompactFloatingSearchBubble. */
  embedded = false,
}: {
  children: ReactNode;
  className?: string;
  embedded?: boolean;
}) {
  if (embedded) {
    return <div className={cn("min-w-0 w-full", className)}>{children}</div>;
  }

  return (
    <div
      className={cn(
        highlightSearchShellClass,
        appToolbarSurfaceShellClassName,
        className
      )}
    >
      {children}
    </div>
  );
}

export function FeedCompactToolbarShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "border-b border-hairline-strong",
        appFeedHeaderFrostedClassName
      )}
    >
      {children}
    </div>
  );
}

/** Compact sticky bar: leading | actions | profile — same layout as dashboard. */
export function FeedToolbarRow({
  leading,
  actions,
  userNav,
  className,
  progress,
  "aria-busy": ariaBusy,
}: {
  leading: ReactNode;
  actions: ReactNode;
  userNav?: ReactNode;
  className?: string;
  progress?: ReactNode;
  "aria-busy"?: boolean;
}) {
  return (
    <div
      className={cn(
        "feed-toolbar relative flex w-full min-w-0 items-center gap-1.5 py-0.5",
        appContentGutterClassName,
        className
      )}
      aria-busy={ariaBusy}
    >
      {progress}
      <div
        className={cn(
          "flex min-w-8 flex-1 items-center gap-1.5 md:min-w-0",
          feedToolbarScrollClassName
        )}
      >
        {leading}
      </div>
      <div
        className={cn(
          "flex min-w-0 shrink items-center gap-1.5",
          feedToolbarScrollClassName
        )}
      >
        {actions}
      </div>
      {userNav ? <div className="shrink-0">{userNav}</div> : null}
    </div>
  );
}

/** Expanded header row: optional leading + search + profile (sm+). */
export function FeedToolbarSearchRow({
  leading,
  search,
  userNav,
  className,
}: {
  leading?: ReactNode;
  search: ReactNode;
  userNav?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-w-0 items-center gap-2", className)}>
      {leading}
      <div className="min-w-0 flex-1">{search}</div>
      {userNav ? (
        <div className="hidden shrink-0 sm:block">{userNav}</div>
      ) : null}
    </div>
  );
}

/** Expanded controls row: scope/filters left, actions + mobile profile right. */
export function FeedToolbarControlsRow({
  leading,
  actions,
  mobileUserNav,
  className,
}: {
  leading: ReactNode;
  actions: ReactNode;
  mobileUserNav?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-2 flex w-full min-w-0 items-center gap-2",
        className
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5",
          feedToolbarScrollClassName
        )}
      >
        {leading}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {mobileUserNav ? (
          <div className="shrink-0 sm:hidden">{mobileUserNav}</div>
        ) : null}
      </div>
    </div>
  );
}
