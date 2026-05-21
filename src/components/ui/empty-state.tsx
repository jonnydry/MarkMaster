"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useOrbitalTheme } from "@/components/providers";
import { useTypography } from "@/hooks/use-typography";
import { orbital } from "@/components/orbital";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const { isOrbital } = useOrbitalTheme();
  const t = useTypography();

  return (
    <div
      className={cn(
        "mx-auto flex min-h-[20rem] w-full max-w-md flex-col items-center justify-center text-center",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 flex h-12 w-12 items-center justify-center rounded-sm border text-primary",
            isOrbital
              ? "border-primary/15 bg-primary/10"
              : "border-primary/15 bg-primary/10"
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <h2
        className={cn(
          "text-xl font-semibold tracking-tight",
          isOrbital ? cn(t.display, "text-foreground") : "heading-font text-foreground"
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-2 max-w-xs text-sm leading-6",
            isOrbital ? cn(t.label, "normal-case tracking-normal text-muted-foreground") : "text-muted-foreground"
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
      {isOrbital ? (
        <div className={cn(orbital.label, "mt-6 text-primary/40")} aria-hidden>
          ◌
        </div>
      ) : null}
    </div>
  );
}
