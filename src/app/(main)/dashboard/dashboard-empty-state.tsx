import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardEmptyStateProps {
  search?: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function DashboardEmptyState({
  search,
  hasActiveFilters,
  onClearFilters,
}: DashboardEmptyStateProps) {
  return (
    <div className="flex h-72 items-center justify-center px-4 sm:px-6">
      <div className="animate-fade-in rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 text-center shadow-sm sm:px-8">
        <Bookmark className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="mb-2 text-lg font-medium heading-font">No bookmarks found</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {search || hasActiveFilters
            ? "Try adjusting your filters or search query"
            : "Use Sync in the sidebar (menu on mobile) to fetch your bookmarks from X"}
        </p>
        {(search || hasActiveFilters) && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
