import { AppPageCenter } from "@/components/app-page-shell";

export default function Loading() {
  return (
    <AppPageCenter>
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
    </AppPageCenter>
  );
}
