import { AppPageCenter } from "@/components/app-page-shell";

export default function Loading() {
  return (
    <AppPageCenter>
      <div
        role="status"
        aria-label="Loading"
        className="size-5 animate-spin rounded-full border-2 border-hairline-strong border-t-muted-foreground"
      />
    </AppPageCenter>
  );
}
