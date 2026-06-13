"use client";

import type { ComponentProps, ReactNode, RefObject } from "react";
import {
  appPageCenterClassName,
  appPageMainClassName,
  appPageMainColumnClassName,
  appPageScrollClassName,
  appPageShellClassName,
  appPageSidebarClassName,
  appPublicPageClassName,
} from "@/lib/app-layout";
import { cn } from "@/lib/utils";

type AppPageShellProps = {
  /** Desktop sidebar slot. Omit for single-column pages (collection detail). */
  sidebar?: ReactNode;
  /** Decorative watermark rendered behind chrome. */
  watermark?: ReactNode;
  /** Content rendered above the scroll region (e.g. sync progress). */
  mainTop?: ReactNode;
  /** Main column content. Wrapped in the scroll region when layout is "scroll". */
  children: ReactNode;
  /** "scroll" — sticky header inside scroll; "column" — header + body flex (Orbit map). */
  layout?: "scroll" | "column";
  className?: string;
  mainClassName?: string;
  scrollClassName?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  mainProps?: Omit<ComponentProps<"div">, "className" | "children">;
};

export function AppPageShell({
  sidebar,
  watermark,
  mainTop,
  children,
  layout = "scroll",
  className,
  mainClassName,
  scrollClassName,
  scrollRef,
  mainProps,
}: AppPageShellProps) {
  const mainColumnClassName =
    layout === "column" ? appPageMainColumnClassName : appPageMainClassName;
  const isSingleColumnScroll = !sidebar && layout === "scroll";

  return (
    <div
      className={cn(
        appPageShellClassName,
        isSingleColumnScroll && "flex-col",
        className
      )}
    >
      {watermark}
      {sidebar ? (
        <div className={appPageSidebarClassName}>{sidebar}</div>
      ) : null}
      {isSingleColumnScroll ? (
        <>
          {mainTop}
          <div
            ref={scrollRef}
            className={cn(appPageScrollClassName, scrollClassName)}
          >
            {children}
          </div>
        </>
      ) : (
        <div className={cn(mainColumnClassName, mainClassName)} {...mainProps}>
          {mainTop}
          {layout === "scroll" ? (
            <div
              ref={scrollRef}
              className={cn(appPageScrollClassName, scrollClassName)}
            >
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

type AppPageCenterProps = {
  children: ReactNode;
  className?: string;
};

/** Centered full-viewport shell for loading and error states. */
export function AppPageCenter({ children, className }: AppPageCenterProps) {
  return (
    <div className={cn(appPageCenterClassName, className)}>{children}</div>
  );
}

type AppPublicPageProps = {
  children: ReactNode;
  className?: string;
};

/** Scrollable public/marketing page shell (share links, landing). */
export function AppPublicPage({ children, className }: AppPublicPageProps) {
  return (
    <div className={cn(appPublicPageClassName, className)}>{children}</div>
  );
}
