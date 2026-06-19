"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
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
      <ErrorState
        layout="page"
        title={title}
        description={error.message || "An unexpected error occurred"}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </AppPageCenter>
  );
}
