"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    console.error(error);
  }, [error]);

  const detail = [error.message, error.digest ? `Digest: ${error.digest}` : null]
    .filter(Boolean)
    .join("\n");

  return (
    <AppPageCenter className="bg-background">
      <ErrorState
        layout="page"
        title={title}
        description="This page hit a problem while loading. Try again — if it keeps happening, reload the app."
        action={
          <div className="flex flex-col items-center gap-4">
            <Button onClick={reset}>Try again</Button>
            {detail ? (
              <details className="w-full max-w-sm text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none text-center hover:text-foreground">
                  Technical details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-2 p-3 font-mono">
                  {detail}
                </pre>
              </details>
            ) : null}
          </div>
        }
      />
    </AppPageCenter>
  );
}
