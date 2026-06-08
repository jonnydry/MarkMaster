"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type EmptyStateLayout = "page" | "panel" | "inline" | "stage";

interface EmptyStateProps {
  icon?: LucideIcon;
  /** Non-Lucide leading content (e.g. brand mark). */
  leading?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  layout?: EmptyStateLayout;
  className?: string;
}

const layoutShell: Record<EmptyStateLayout, string> = {
  page: "mx-auto flex min-h-[20rem] w-full max-w-md flex-col items-center justify-center text-center",
  panel:
    "mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-sm border border-hairline-soft bg-surface-1/70 px-6 py-8 text-center sm:px-8",
  inline: "border-y border-hairline-soft py-10 text-center",
  stage: "mx-auto flex max-w-md flex-col items-center justify-center text-center",
};

export function EmptyState({
  icon: Icon,
  leading,
  title,
  description,
  action,
  layout = "page",
  className,
}: EmptyStateProps) {
  const isStage = layout === "stage";

  const titleClass = cn(
    layout === "page"
      ? "text-xl font-semibold tracking-tight"
      : layout === "panel"
        ? "text-lg font-medium"
        : "text-base font-semibold",
    isStage && "text-lg font-medium text-foreground",
    !isStage && "heading-font text-foreground"
  );

  const descriptionClass = cn(
    layout === "panel" ? "mx-auto mt-2 max-w-md text-sm text-muted-foreground" : "mt-2 max-w-xs text-sm leading-6",
    isStage ? "max-w-md text-sm text-muted-foreground" : "text-muted-foreground"
  );

  const iconWrapClass = cn(
    "flex items-center justify-center rounded-sm border text-primary",
    layout === "panel" ? "mx-auto mb-4 h-12 w-12" : "mx-auto mb-4 h-12 w-12",
    "border-primary/15 bg-primary/10"
  );

  return (
    <div className={cn(layoutShell[layout], className)}>
      {leading}
      {Icon ? (
        <div className={iconWrapClass}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      ) : null}
      <h2 className={titleClass}>{title}</h2>
      {description ? <p className={descriptionClass}>{description}</p> : null}
      {action ? (
        <div className={layout === "page" ? "mt-5" : "mt-4"}>{action}</div>
      ) : null}
    </div>
  );
}
