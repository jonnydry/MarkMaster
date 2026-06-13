"use client";

import { Button } from "@/components/ui/button";
import { AppPageCenter } from "@/components/app-page-shell";

type AppRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
};

/** Shared Next.js route error boundary shell for authenticated pages. */
export function AppRouteError({
  error,
  reset,
  title = "Something went wrong",
}: AppRouteErrorProps) {
  return (
    <AppPageCenter className="bg-background">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-xl font-semibold">{title}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred"}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </AppPageCenter>
  );
}
