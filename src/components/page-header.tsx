import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = ComponentProps<"header"> & {
  title?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  sticky?: boolean;
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
  ...props
}: PageHeaderProps) {
  const hasHeaderRow = title || description || leading || actions;
  const mergedHeaderClassName = cn(
    "shrink-0 border-b border-hairline-strong bg-background/70 backdrop-blur-sm supports-[backdrop-filter]:bg-background/65",
    sticky && "sticky top-0 z-10",
    className
  );

  return (
    <header className={mergedHeaderClassName} {...props}>
      <div className={cn("px-4 py-3 sm:px-5", bodyClassName)}>
        {hasHeaderRow ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {leading ? <div className="shrink-0">{leading}</div> : null}
              <div className="min-w-0">
                {title ? (
                  <h1
                    className={cn(
                      "truncate text-lg font-bold tracking-tight heading-font sm:text-xl",
                      titleClassName
                    )}
                  >
                    {title}
                  </h1>
                ) : null}
                {description ? (
                  <p
                    className={cn(
                      "mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm",
                      descriptionClassName
                    )}
                  >
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
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
