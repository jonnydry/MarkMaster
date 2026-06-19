"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { useTypography } from "@/hooks/use-typography";
import { cn } from "@/lib/utils";

interface ModuleHeaderProps {
  icon: LucideIcon;
  eyebrow: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
  iconClassName?: string;
  contentClassName?: string;
}

export function ModuleHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  meta,
  action,
  className,
  iconClassName,
  contentClassName,
}: ModuleHeaderProps) {
  const t = useTypography();

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-primary/15 bg-primary/10 text-primary",
            iconClassName
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className={cn("min-w-0", contentClassName)}>
          <p
            className={cn(t.sectionLabel, "mb-0")}
          >
            {eyebrow}
          </p>
          {title ? (
            <h2 className={cn(t.display, "mt-1 text-lg font-semibold tracking-tight text-foreground")}>
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? <p className="mt-1 text-2xs text-muted-foreground/70">{meta}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
