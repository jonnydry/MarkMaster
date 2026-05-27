"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RetryContext = "default" | "stage";

interface RetryButtonProps extends Omit<ComponentProps<typeof Button>, "children"> {
  label?: string;
  context?: RetryContext;
}

export function RetryButton({
  label = "Retry",
  context = "default",
  className,
  ...props
}: RetryButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={context === "stage" ? "default" : "outline"}
      className={cn(context === "default" && "mt-3", className)}
      {...props}
    >
      {label}
    </Button>
  );
}
