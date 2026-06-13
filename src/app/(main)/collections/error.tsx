"use client";

import { AppRouteError } from "@/components/app-route-error";

export default function CollectionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppRouteError error={error} reset={reset} title="Failed to load collections" />
  );
}
