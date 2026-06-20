"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRef } from "react";
import { usePageHeaderCompact } from "@/hooks/use-page-header-compact";
import { useStickyHeaderHeight } from "@/hooks/use-sticky-header-height";
import {
  appChromeFrostedClassName,
  appContentGutterClassName,
  appFeedHeaderFrostedClassName,
} from "@/lib/app-chrome";
import { bookmarkFeedMaxWidthClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";

type PageHeaderProps = Omit<ComponentProps<"header">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  sticky?: boolean;
  /** Omit frosted chrome (e.g. when wrapped by a parent that already applies it). */
  chromeless?: boolean;
  /** Show a compact-header toggle; only affects header chrome and toolbar children. */
  compactable?: boolean;
  /**
   * Feed-surface chrome (dashboard / Orbit toolbars). Applies the lighter frosted
   * header background + hairline. When compact, the header itself goes transparent
   * so the toolbar can paint its own bar and the search bubble floats below it.
   */
  feedChrome?: boolean;
};

export function PageHeader({
  title,
  description,
  leading,
  actions,
  children,
  className,
  bodyClassName,
  titleClassName,
  descriptionClassName,
  sticky = false,
  chromeless = false,
  compactable = false,
  feedChrome = false,
  ...props
}: PageHeaderProps) {
  const t = useTypography();
  const { compact } = usePageHeaderCompact();
  const headerRef = useRef<HTMLElement>(null);
  useStickyHeaderHeight(sticky, headerRef);
  const isCompact = compactable && compact;
  const hasHeaderRow = title || description || leading || actions;
  const chromeClassName = feedChrome
    ? isCompact
      ? "border-b-0 bg-transparent"
      : cn("border-b border-hairline-strong", appFeedHeaderFrostedClassName)
    : chromeless
      ? "border-b-0 bg-transparent"
      : cn("border-b border-hairline-strong", appChromeFrostedClassName);
  const mergedHeaderClassName = cn(
    "shrink-0",
    chromeClassName,
    sticky && "sticky top-0 z-[var(--z-sticky-header)]",
    className
  );

  return (
    <header
      ref={headerRef}
      className={mergedHeaderClassName}
      data-page-header-compact={isCompact ? "" : undefined}
      {...props}
    >
      <div
        className={cn(
          // Feed surfaces self-gutter (toolbar / filter panel / search bubble),
          // so the body wrapper stays edge-to-edge — the bar chrome can span full
          // width. Other surfaces get the standard gutter + vertical rhythm.
          feedChrome ? undefined : cn(appContentGutterClassName, isCompact ? "py-1.5" : "py-3"),
          bodyClassName
        )}
      >
        {hasHeaderRow ? (
          <div
            className={cn(
              "flex flex-col sm:flex-row sm:items-center sm:justify-between",
              isCompact ? "gap-2" : "gap-3"
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {leading ? <div className="shrink-0">{leading}</div> : null}
              <div className="min-w-0">
                {title ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <h1
                      className={cn(
                        t.display,
                        "truncate font-bold tracking-tight",
                        isCompact
                          ? "text-base sm:text-lg"
                          : "text-lg sm:text-xl",
                        titleClassName
                      )}
                    >
                      {title}
                    </h1>
                  </div>
                ) : null}
                {description ? (
                  <p
                    className={cn(
                      "mt-1 text-xs text-muted-foreground sm:text-sm",
                      bookmarkFeedMaxWidthClassName,
                      descriptionClassName
                    )}
                  >
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? (
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink sm:justify-end sm:gap-3">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </header>
  );
}
