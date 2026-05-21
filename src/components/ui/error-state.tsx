"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
import { useTypography } from "@/hooks/use-typography";

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again or contact support if the problem persists.",
  action,
  className,
}: ErrorStateProps) {
  const { isOrbital } = useOrbitalTheme();
  const t = useTypography();

  return (
    <div
      className={cn(
        "mx-auto flex min-h-[16rem] w-full max-w-md flex-col items-center justify-center text-center",
        className
      )}
      role="alert"
    >
      <div
        className={cn(
          "mb-3 flex h-10 w-10 items-center justify-center rounded-full",
          isOrbital
            ? "border border-destructive/30 bg-destructive/10 text-destructive"
            : "bg-destructive/10 text-destructive"
        )}
      >
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2
        className={cn(
          "text-lg font-semibold",
          isOrbital ? t.display : "heading-font text-foreground"
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-1.5 max-w-xs text-sm leading-6",
          isOrbital ? cn(t.label, "normal-case tracking-normal text-muted-foreground") : "text-muted-foreground"
        )}
      >
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
