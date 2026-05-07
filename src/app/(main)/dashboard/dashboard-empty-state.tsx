import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";

interface DashboardEmptyStateProps {
  search?: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  lastSyncAt?: Date | null;
  onSyncComplete?: () => void;
}

export function DashboardEmptyState({
  search,
  hasActiveFilters,
  onClearFilters,
  lastSyncAt = null,
  onSyncComplete,
}: DashboardEmptyStateProps) {
  const filtered = Boolean(search || hasActiveFilters);

  return (
    <div className="flex h-72 items-center justify-center px-4 sm:px-6">
      <div className="animate-fade-in w-full max-w-xl rounded-sm border border-hairline-soft bg-surface-1/70 px-6 py-8 text-center sm:px-8">
        <Bookmark className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="mb-2 text-lg font-medium heading-font">No bookmarks found</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {filtered
            ? "Try adjusting your filters or search query"
            : "Sync your X bookmarks, then use Orbit to triage the saves that still need a home."}
        </p>
        {filtered ? (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="mx-auto mt-5 max-w-sm">
            <SyncButton
              lastSyncAt={lastSyncAt}
              onSyncComplete={onSyncComplete}
              detail="full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
