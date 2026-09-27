"use client";

import type { ComponentProps, ReactNode, RefObject } from "react";
import { usePageActive } from "@/components/page-activity";
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
  /**
   * Fill the app frame's main column. The frame already owns the viewport
   * and the persistent sidebar.
   */
  embedded?: boolean;
  /** Non-interactive layer painted behind the sidebar and main column. */
  backdrop?: ReactNode;
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
  backdrop,
  mainTop,
  children,
  layout = "scroll",
  embedded = false,
  className,
  mainClassName,
  scrollClassName,
  scrollRef,
  mainProps,
}: AppPageShellProps) {
  const pageActive = usePageActive();
  const contentId = pageActive ? "app-main-content" : undefined;
  if (embedded) {
    if (layout === "column") {
      return (
        <div
          className={cn(appPageMainColumnClassName, className)}
          {...mainProps}
          id={contentId}
          tabIndex={contentId ? -1 : undefined}
        >
          {mainTop}
          {children}
        </div>
      );
    }

    return (
      <div className={cn(appPageMainClassName, "h-auto", className)} {...mainProps}>
        {mainTop}
        <div
          ref={scrollRef}
          id={contentId}
          tabIndex={contentId ? -1 : undefined}
          className={cn(appPageScrollClassName, scrollClassName)}
        >
          {children}
        </div>
      </div>
    );
  }

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
      {backdrop}
      {sidebar ? (
        <div className={appPageSidebarClassName}>{sidebar}</div>
      ) : null}
      {isSingleColumnScroll ? (
        <>
          {mainTop}
          <div
            ref={scrollRef}
            id={contentId}
            tabIndex={contentId ? -1 : undefined}
            className={cn(appPageScrollClassName, scrollClassName)}
          >
            {children}
          </div>
        </>
      ) : (
        <div
          className={cn(mainColumnClassName, mainClassName)}
          {...mainProps}
          id={layout === "column" ? contentId : undefined}
          tabIndex={layout === "column" && contentId ? -1 : undefined}
        >
          {mainTop}
          {layout === "scroll" ? (
            <div
              ref={scrollRef}
              id={contentId}
              tabIndex={contentId ? -1 : undefined}
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
