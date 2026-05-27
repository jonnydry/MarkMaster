"use client";

import type { ComponentProps, ReactNode } from "react";
import { appChromeFrostedClassName, appContentGutterClassName } from "@/lib/app-chrome";
import { bookmarkFeedMaxWidthClassName } from "@/lib/bookmark-feed-layout";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";
import { useOrbitalTheme } from "@/components/providers";
import { OrbitalBadge } from "@/components/orbital";

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
  ...props
}: PageHeaderProps) {
  const t = useTypography();
  const { isOrbital } = useOrbitalTheme();
  const hasHeaderRow = title || description || leading || actions;
  const mergedHeaderClassName = cn(
    "shrink-0",
    chromeless
      ? "border-b-0 bg-transparent"
      : cn(
          "border-b border-hairline-strong",
          appChromeFrostedClassName,
          isOrbital && "shadow-[inset_0_-1px_0_var(--accent-glow)]"
        ),
    sticky && "sticky top-0 z-[var(--z-sticky-header)]",
    className
  );

  return (
    <header className={mergedHeaderClassName} {...props}>
      <div className={cn(appContentGutterClassName, "py-3", bodyClassName)}>
        {hasHeaderRow ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {leading ? <div className="shrink-0">{leading}</div> : null}
              <div className="min-w-0">
                {title ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <h1
                      className={cn(
                        "truncate text-lg font-bold tracking-tight heading-font sm:text-xl",
                        titleClassName
                      )}
                    >
                      {title}
                    </h1>
                    {isOrbital ? (
                      <OrbitalBadge tone="cyan" className="hidden shrink-0 sm:inline-flex">
                        Orbit
                      </OrbitalBadge>
                    ) : null}
                  </div>
                ) : null}
                {description ? (
                  <p
                    className={cn(
                      "mt-1 text-xs text-muted-foreground sm:text-sm",
                      t.monoNative ? t.label : undefined,
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
