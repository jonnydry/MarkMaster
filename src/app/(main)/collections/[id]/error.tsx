"use client";

import { Button } from "@/components/ui/button";

export default function CollectionDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold mb-2">Failed to load collection</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {error.message || "An unexpected error occurred"}
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
