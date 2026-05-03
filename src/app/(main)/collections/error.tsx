"use client";

import { Button } from "@/components/ui/button";

export default function CollectionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-min-viewport flex items-center justify-center bg-background">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold mb-2">Failed to load collections</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {error.message || "An unexpected error occurred"}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
